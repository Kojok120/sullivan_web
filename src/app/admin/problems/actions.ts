'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export async function getProblems(
    page: number = 1,
    limit: number = 20,
    search: string = '',
    filters: {
        grade?: string;
        subjectId?: string; // Filter by subject via CoreProblem relation could be complex, maybe later
        coreProblemId?: string;
    } = {}
) {
    await requireAdmin();
    try {
        const where: Prisma.ProblemWhereInput = {};

        if (search) {
            where.OR = [
                { question: { contains: search, mode: 'insensitive' } },
                { answer: { contains: search, mode: 'insensitive' } },
                { customId: { contains: search, mode: 'insensitive' } },
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
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.problem.count({ where }),
        ]);

        return { success: true, problems, total, page, limit };
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
    answer: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[]; // Can be empty initially
}) {
    await requireAdmin();
    try {
        // NOTE: strict validation or customId generation logic might need one subject context
        // If we don't have a coreProblem linked, we might not be able to generate a customId effectively if it's tied to Subject
        // For now, let's assume we need at least one coreProblem to generate customId OR we make customId optional/global?
        // Schema says: customId String? @unique.
        // The existing logic relies on Subject to generate customId (e.g. "S-1").
        // If we connect multiple core problems, which subject custom ID do we use?
        // -> Probably the first one.

        let customId: string | undefined;

        if (data.coreProblemIds.length > 0) {
            const firstCP = await prisma.coreProblem.findUnique({
                where: { id: data.coreProblemIds[0] },
                include: { subject: true }
            });
            if (firstCP) {
                const { getNextCustomId } = await import('@/lib/curriculum-service');
                customId = await getNextCustomId(firstCP.subjectId);
            }
        }

        const problem = await prisma.problem.create({
            data: {
                question: data.question,
                answer: data.answer,
                acceptedAnswers: data.acceptedAnswers || [],
                grade: data.grade,
                videoUrl: data.videoUrl,
                customId: customId, // Might be null if no core problem linked
                order: 0, // Default order? or should we manage it?
                coreProblems: {
                    connect: data.coreProblemIds.map(id => ({ id }))
                }
            }
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
        // Similar to deleteProblem in curriculum actions
        await prisma.$transaction([
            prisma.learningHistory.deleteMany({ where: { problemId: id } }),
            prisma.userProblemState.deleteMany({ where: { problemId: id } }),
            prisma.problem.delete({ where: { id } }),
        ]);

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

        // Delete related data first, then problems
        await prisma.$transaction([
            prisma.learningHistory.deleteMany({ where: { problemId: { in: ids } } }),
            prisma.userProblemState.deleteMany({ where: { problemId: { in: ids } } }),
            prisma.problem.deleteMany({ where: { id: { in: ids } } }),
        ]);

        revalidatePath('/admin/problems');
        return { success: true, count: ids.length };
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
        const uniqueNames = [...new Set(names)];
        if (uniqueNames.length === 0) {
            return { success: true, coreProblemsMap: {} };
        }

        const coreProblems = await prisma.coreProblem.findMany({
            where: {
                name: { in: uniqueNames }
            },
            include: { subject: true },
            orderBy: [
                { subject: { order: 'asc' } },
                { order: 'asc' }
            ]
        });

        // 名前→CoreProblemのマップを返す（完全一致優先）
        const resultMap: Record<string, typeof coreProblems[0] | null> = {};
        for (const name of uniqueNames) {
            const exactMatch = coreProblems.find(cp => cp.name === name);
            const partialMatch = coreProblems.find(cp =>
                cp.name.toLowerCase().includes(name.toLowerCase())
            );
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
    answer: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[];
}[]) {
    await requireAdmin();
    try {
        const { getNextCustomIds } = await import('@/lib/curriculum-service');

        let createdCount = 0;
        const warnings: string[] = [];

        await prisma.$transaction(async (tx) => {
            // [N+1 解消] 1. 重複チェックを一括で行う
            const allQuestions = problems.map(p => p.question);
            const existingProblems = await tx.problem.findMany({
                where: { question: { in: allQuestions } },
                select: { question: true }
            });
            const existingQuestions = new Set(existingProblems.map(p => p.question));

            // [N+1 解消] 2. 必要なCoreProblemを一括取得
            const allCoreProblemIds = [...new Set(problems.flatMap(p => p.coreProblemIds))];
            const coreProblemRecords = allCoreProblemIds.length > 0
                ? await tx.coreProblem.findMany({
                    where: { id: { in: allCoreProblemIds } },
                    include: { subject: true }
                })
                : [];
            const coreProblemMap = new Map(coreProblemRecords.map(cp => [cp.id, cp]));

            // [N+1 解消] 3. 登録対象の問題をフィルタリングし、subjectId別にグループ化
            type ProblemWithSubject = (typeof problems)[0] & { subjectId?: string };
            const problemsToCreate: ProblemWithSubject[] = [];
            const subjectCounts: Map<string, number> = new Map();

            for (const p of problems) {
                if (existingQuestions.has(p.question)) {
                    warnings.push(`「${p.question.substring(0, 10)}...」は既に存在するためスキップしました`);
                    continue;
                }

                let subjectId: string | undefined;
                if (p.coreProblemIds.length > 0) {
                    const firstCP = coreProblemMap.get(p.coreProblemIds[0]);
                    if (firstCP) {
                        subjectId = firstCP.subjectId;
                    }
                }

                problemsToCreate.push({ ...p, subjectId });

                if (subjectId) {
                    subjectCounts.set(subjectId, (subjectCounts.get(subjectId) || 0) + 1);
                }
            }

            // [N+1 解消] 4. 各subjectのcustomIdを一括生成
            const customIdsBySubject: Map<string, string[]> = new Map();
            for (const [subjectId, count] of subjectCounts) {
                const ids = await getNextCustomIds(subjectId, count, tx);
                customIdsBySubject.set(subjectId, ids);
            }

            // 5. 問題を作成
            const subjectIndexes: Map<string, number> = new Map();
            for (const p of problemsToCreate) {
                let customId: string | undefined;

                if (p.subjectId) {
                    const ids = customIdsBySubject.get(p.subjectId);
                    const idx = subjectIndexes.get(p.subjectId) || 0;
                    if (ids && ids[idx]) {
                        customId = ids[idx];
                        subjectIndexes.set(p.subjectId, idx + 1);
                    }
                }

                await tx.problem.create({
                    data: {
                        question: p.question,
                        answer: p.answer,
                        acceptedAnswers: p.acceptedAnswers || [],
                        grade: p.grade,
                        videoUrl: p.videoUrl,
                        customId: customId,
                        order: 0,
                        coreProblems: {
                            connect: p.coreProblemIds.map(id => ({ id }))
                        }
                    }
                });
                createdCount++;
            }
        }, {
            maxWait: 10000,
            timeout: 30000 // Increased timeout for bulk operations
        });

        revalidatePath('/admin/problems');
        return { success: true, count: createdCount, warnings };
    } catch (error) {
        console.error('Failed to bulk create problems:', error);
        return { error: '一括登録に失敗しました' };
    }
}
