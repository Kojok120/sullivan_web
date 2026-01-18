'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { bulkCreateProblemsCore, createProblemCore, deleteProblemsWithRelations } from '@/lib/problem-service';

type ProblemFilters = {
    grade?: string;
    subjectId?: string;
    coreProblemId?: string;
};

function buildProblemWhereSql({
    search,
    filters,
    excludeIds = [],
}: {
    search?: string;
    filters: ProblemFilters;
    excludeIds?: string[];
}) {
    const conditions: Prisma.Sql[] = [];

    if (filters.grade) {
        conditions.push(Prisma.sql`p."grade" = ${filters.grade}`);
    }

    if (filters.coreProblemId) {
        conditions.push(Prisma.sql`
            EXISTS (
                SELECT 1
                FROM "_CoreProblemToProblem" cpp
                WHERE cpp."B" = p.id AND cpp."A" = ${filters.coreProblemId}
            )
        `);
    }

    if (search) {
        const like = `%${search}%`;
        conditions.push(Prisma.sql`
            (
                p."question" ILIKE ${like}
                OR p."answer" ILIKE ${like}
                OR p."customId" ILIKE ${like}
                OR EXISTS (
                    SELECT 1
                    FROM "_CoreProblemToProblem" cpp
                    JOIN "CoreProblem" cp ON cp.id = cpp."A"
                    WHERE cpp."B" = p.id AND cp."name" ILIKE ${like}
                )
            )
        `);
    }

    if (excludeIds.length > 0) {
        conditions.push(Prisma.sql`p.id NOT IN (${Prisma.join(excludeIds)})`);
    }

    if (conditions.length === 0) {
        return Prisma.empty;
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, Prisma.raw(' AND '))}`;
}

export async function getProblems(
    page: number = 1,
    limit: number = 20,
    search: string = '',
    filters: ProblemFilters = {},
    sortBy: 'updatedAt' | 'createdAt' | 'customId' = 'updatedAt',
    sortOrder: 'asc' | 'desc' = 'desc'
) {
    await requireAdmin();
    try {
        const where: Prisma.ProblemWhereInput = {};

        if (search) {
            where.OR = [
                { question: { contains: search, mode: 'insensitive' } },
                { answer: { contains: search, mode: 'insensitive' } },
                { customId: { contains: search, mode: 'insensitive' } },
                {
                    coreProblems: {
                        some: {
                            name: { contains: search, mode: 'insensitive' }
                        }
                    }
                },
            ];
        }

        if (filters.grade) {
            where.grade = filters.grade;
        }

        if (filters.coreProblemId) {
            where.coreProblems = {
                some: { id: filters.coreProblemId }
            };
        }


        const skip = (page - 1) * limit;
        const isCustomIdSort = sortBy === 'customId';
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        const orderBy: Prisma.ProblemOrderByWithRelationInput[] =
            sortBy === 'createdAt'
                ? [{ createdAt: sortOrder }, { id: 'asc' }]
                : [{ updatedAt: sortOrder }, { id: 'asc' }];

        const fetchProblemsByIds = async (ids: string[]) => {
            if (ids.length === 0) return [];
            const problems = await prisma.problem.findMany({
                where: { id: { in: ids } },
                include: {
                    coreProblems: {
                        include: {
                            subject: true
                        }
                    }
                }
            });
            const problemMap = new Map(problems.map(p => [p.id, p]));
            return ids.map(id => problemMap.get(id)).filter(Boolean);
        };

        const fetchCustomIdSortedIds = async ({
            searchTerm,
            excludeIds,
            take,
            offset
        }: {
            searchTerm?: string;
            excludeIds?: string[];
            take: number;
            offset: number;
        }) => {
            const whereSql = buildProblemWhereSql({
                search: searchTerm,
                filters,
                excludeIds
            });
            const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
                SELECT p.id
                FROM "Problem" p
                ${whereSql}
                ORDER BY
                    CASE WHEN p."customId" IS NULL THEN 1 ELSE 0 END ASC,
                    upper(split_part(p."customId", '-', 1)) ${Prisma.raw(orderDirection)},
                    substring(p."customId" from '^[^-]+-([0-9]+)$')::int ${Prisma.raw(orderDirection)} NULLS LAST,
                    p.id ASC
                LIMIT ${take}
                OFFSET ${offset}
            `);
            return rows.map(row => row.id);
        };

        const countCustomIdSorted = async ({
            searchTerm,
            excludeIds
        }: {
            searchTerm?: string;
            excludeIds?: string[];
        }) => {
            const whereSql = buildProblemWhereSql({
                search: searchTerm,
                filters,
                excludeIds
            });
            const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
                SELECT COUNT(*)::bigint AS count
                FROM "Problem" p
                ${whereSql}
            `);
            return Number(rows[0]?.count || 0);
        };

        // Partial match query (exclude exact matches to avoid duplicates if we were to just concat,
        // but since we page, we need a more robust strategy or just acceptable approximation)
        // A simple "exact match first" strategy with pagination is tricky in one go without raw SQL.
        // Option:
        // 1. If page=1, try to fetch exact matches first. 
        // 2. Fetch partial matches.
        // 3. Combine.
        // Limitation: Deep pagination with this hybrid approach is complex. 
        // However, usually exact match is unique or very few.
        // Let's implement a 'prioritize exact match' by fetching it separately ONLY if we are on page 1
        // OR we just rely on sorting if we could... but Prisma doesn't support sorting by "match quality" easily.

        // Revised strategy for usability:
        // Fetch separate lists?
        // If search is provided:

        let exactMatches: any[] = [];
        let partialMatches: any[] = [];
        let total = 0;

        if (search) {
            // 1. Get Exact Matches (only if search looks like an ID?) - let's just try matching customId exactly
            // We only do this "boost" on the first page effectively, or we have to complicate the count/skip logic.
            // For simplicity and common use case checking "E-1":
            // If the user searches "E-1", they want to see E-1 at the top.

            // We will execute two queries. 
            // Query A: Exact match on customId
            // Query B: The original OR query BUT excluding the ids from Query A (to avoid duplicates)

            // We need to fetch enough items to fill the current page.
            // This is getting complicated for standard pagination.
            // Let's simplify: 
            // Just add a secondary sort criteria? No, that doesn't help "E-1" vs "E-10".
            // 
            // Alternative: Sorting in memory?
            // If we fetch `limit` items, E-1 might be on page 2.
            // So we MUST fetch exact matches regardless of pagination if they exist?
            // That breaks standard pagination if there are many exact matches (unlikely for ID).

            // Pragmatic approach for "E-1" case:
            // 1. Search is usually for a specific ID.
            // 2. Search exact match for customId.
            // 3. If found, put it at the start of the list.
            // 4. Then fill the rest with standard results.

            // Constraint: We need to handle pagination correct-ish.
            // If we inject result at top, total count increases? Or is it part of the set?
            // It IS part of the set.

            // Let's stick to the user request: "Ranking".
            // We can't easy change Postgres sort order via Prisma for "exact match first".
            // We will try raw query or two prisma queries.
            // Given typical dataset size and strict "ID" nature:
            // Let's Find specific exact match ID(s).

            const exactMatchProblems = await prisma.problem.findMany({
                where: {
                    AND: [
                        filters.grade ? { grade: filters.grade } : {},
                        filters.coreProblemId ? { coreProblems: { some: { id: filters.coreProblemId } } } : {},
                        { customId: { equals: search, mode: 'insensitive' } } // Strict equality
                    ]
                },
                include: {
                    coreProblems: {
                        include: {
                            subject: true
                        }
                    }
                }
            });

            const exactMatchIds = exactMatchProblems.map(p => p.id);

            // Main query (exclude exact matches)
            const partialWhere: Prisma.ProblemWhereInput = {
                AND: [
                    where,
                    { id: { notIn: exactMatchIds } }
                ]
            };

            if (isCustomIdSort) {
                const partialTotal = await countCustomIdSorted({
                    searchTerm: search,
                    excludeIds: exactMatchIds
                });
                total = exactMatchIds.length + partialTotal;
            } else {
                const partialTotal = await prisma.problem.count({ where: partialWhere });
                total = exactMatchIds.length + partialTotal;
            }

            // Pagination logic considering the injected exact matches
            // If we are on page 1, we show Exact matches + (limit - exact) partials.
            // If we are on page 2, we show partials starting from offset...

            const exactCount = exactMatchIds.length;

            if (page === 1) {
                exactMatches = exactMatchProblems;
                const remainingLimit = limit - exactMatches.length;
                if (remainingLimit > 0) {
                    if (isCustomIdSort) {
                        const ids = await fetchCustomIdSortedIds({
                            searchTerm: search,
                            excludeIds: exactMatchIds,
                            take: remainingLimit,
                            offset: 0
                        });
                        partialMatches = await fetchProblemsByIds(ids);
                    } else {
                        partialMatches = await prisma.problem.findMany({
                            where: partialWhere,
                            include: {
                                coreProblems: {
                                    include: {
                                        subject: true
                                    }
                                }
                            },
                            orderBy,
                            take: remainingLimit,
                            skip: 0
                        });
                    }
                }
            } else {
                // Page > 1
                // We skip (page-1)*limit, but we must account for the exact matches that were theoretically on page 1.
                // The "effective" skip for partial query is: (page-1)*limit - exactCount
                // If (page-1)*limit < exactCount, valid only if exactCount > limit (unlikely for ID).

                const effectiveSkip = Math.max(0, (page - 1) * limit - exactCount);

                if (isCustomIdSort) {
                    const ids = await fetchCustomIdSortedIds({
                        searchTerm: search,
                        excludeIds: exactMatchIds,
                        take: limit,
                        offset: effectiveSkip
                    });
                    partialMatches = await fetchProblemsByIds(ids);
                } else {
                    partialMatches = await prisma.problem.findMany({
                        where: partialWhere,
                        include: {
                            coreProblems: {
                                include: {
                                    subject: true
                                }
                            },
                        },
                        orderBy,
                        take: limit,
                        skip: effectiveSkip
                    });
                }
            }

            return { success: true, problems: [...exactMatches, ...partialMatches], total, page, limit };

        } else {
            if (isCustomIdSort) {
                const [ids, total] = await Promise.all([
                    fetchCustomIdSortedIds({
                        searchTerm: '',
                        take: limit,
                        offset: skip
                    }),
                    countCustomIdSorted({ searchTerm: '' })
                ]);
                const problems = await fetchProblemsByIds(ids);
                return { success: true, problems, total, page, limit };
            }

            // Standard behavior without search
            const [problems, total] = await Promise.all([
                prisma.problem.findMany({
                    where,
                    include: {
                        coreProblems: {
                            include: {
                                subject: true
                            }
                        }
                    },
                    orderBy,
                    skip,
                    take: limit,
                }),
                prisma.problem.count({ where }),
            ]);
            return { success: true, problems, total, page, limit };
        }
    } catch (error) {
        console.error('Failed to fetch problems:', error);
        return { error: '問題の取得に失敗しました' };
    }
}

export async function getProblemById(id: string) {
    await requireAdmin();
    try {
        const problem = await prisma.problem.findUnique({
            where: { id },
            include: {
                coreProblems: {
                    include: {
                        subject: true
                    }
                }
            }
        });
        if (!problem) return { error: '問題が見つかりません' };
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to fetch problem:', error);
        return { error: '問題の取得に失敗しました' };
    }
}

export async function searchCoreProblems(query: string) {
    await requireAdmin();
    try {
        const coreProblems = await prisma.coreProblem.findMany({
            where: {
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                ]
            },
            include: {
                subject: true
            },
            orderBy: [
                { subject: { order: 'asc' } },
                { order: 'asc' }
            ],
            take: 20
        });
        return { success: true, coreProblems };
    } catch (error) {
        console.error('Failed to search core problems:', error);
        return { error: 'CoreProblemの検索に失敗しました' };
    }
}

// Re-using/Refining createProblem from curriculum actions but decoupling it
export async function createStandaloneProblem(data: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[]; // Can be empty initially
}) {
    await requireAdmin();
    try {
        // NOTE: customId生成はcreateProblemCore側で共通化
        const problem = await createProblemCore({
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
            videoUrl: data.videoUrl,
            coreProblemIds: data.coreProblemIds,
            order: 0, // 既存挙動（未指定相当）を維持
        });

        revalidatePath('/admin/problems');
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to create problem:', error);
        return { error: '問題の作成に失敗しました' };
    }
}

export async function updateStandaloneProblem(id: string, data: {
    question?: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds?: string[]; // Replace connections
}) {
    await requireAdmin();
    try {
        const updateData: Prisma.ProblemUpdateInput = {
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
            videoUrl: data.videoUrl,
        };

        if (data.coreProblemIds) {
            updateData.coreProblems = {
                set: data.coreProblemIds.map(cid => ({ id: cid }))
            };
        }

        const problem = await prisma.problem.update({
            where: { id },
            data: updateData,
            include: { coreProblems: true }
        });

        // Ensure customId exists if it was null and now has core problems?
        // This is a bit complex edge case. Let's ignore auto-backfilling customId for now unless requested.

        revalidatePath('/admin/problems');
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to update problem:', error);
        return { error: '問題の更新に失敗しました' };
    }
}

export async function deleteStandaloneProblem(id: string) {
    await requireAdmin();
    try {
        await deleteProblemsWithRelations([id]);

        revalidatePath('/admin/problems');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete problem:', error);
        return { error: '問題の削除に失敗しました' };
    }
}

export async function bulkDeleteProblems(ids: string[]) {
    await requireAdmin();
    try {
        if (ids.length === 0) return { success: true, count: 0 };

        const deletedCount = await deleteProblemsWithRelations(ids);

        revalidatePath('/admin/problems');
        return { success: true, count: deletedCount };
    } catch (error) {
        console.error('Failed to bulk delete problems:', error);
        return { error: '問題の一括削除に失敗しました' };
    }
}

/**
 * 複数のCoreProblem名を一括検索 (N+1問題解消用)
 */
export async function bulkSearchCoreProblems(names: string[]) {
    await requireAdmin();
    try {
        const uniqueNames = [...new Set(names.map(name => name.trim()))].filter(Boolean);
        if (uniqueNames.length === 0) {
            return { success: true, coreProblemsMap: {} };
        }

        const coreProblems = await prisma.coreProblem.findMany({
            where: {
                OR: uniqueNames.map(name => ({
                    name: { contains: name, mode: 'insensitive' }
                }))
            },
            include: { subject: true },
            orderBy: [
                { subject: { order: 'asc' } },
                { order: 'asc' }
            ]
        });

        const normalizedCoreProblems = coreProblems.map(cp => ({
            coreProblem: cp,
            nameLower: cp.name.toLowerCase()
        }));
        const exactMatchMap = new Map(
            normalizedCoreProblems.map(item => [item.nameLower, item.coreProblem])
        );

        // 名前→CoreProblemのマップを返す（完全一致優先）
        const resultMap: Record<string, typeof coreProblems[0] | null> = {};
        for (const name of uniqueNames) {
            const normalized = name.toLowerCase();
            const exactMatch = exactMatchMap.get(normalized);
            const partialMatch = normalizedCoreProblems.find(item =>
                item.nameLower.includes(normalized)
            )?.coreProblem;
            resultMap[name] = exactMatch || partialMatch || null;
        }

        return { success: true, coreProblemsMap: resultMap };
    } catch (error) {
        console.error('Failed to bulk search core problems:', error);
        return { error: 'CoreProblemの一括検索に失敗しました' };
    }
}

export async function bulkCreateStandaloneProblems(problems: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[];
}[]) {
    await requireAdmin();
    try {
        const { count, warnings } = await bulkCreateProblemsCore(
            problems,
            { batchSize: 50, assignOrder: false }
        );

        revalidatePath('/admin/problems');
        return { success: true, count, warnings };
    } catch (error) {
        console.error('Failed to bulk create problems:', error);
        return { error: '一括登録に失敗しました' };
    }
}
