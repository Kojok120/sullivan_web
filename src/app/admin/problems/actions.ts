'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { bulkCreateProblemsCore, bulkUpsertProblemsCore, createProblemCore, deleteProblemsWithRelations } from '@/lib/problem-service';

type ProblemFilters = {
    grade?: string;
    subjectId?: string;
    coreProblemId?: string;
    video?: 'exists' | 'none';
};

/**
 * フィルタ条件の単一ソース
 * ここで定義した条件がPrisma形式とSQL形式の両方に変換される
 */
type FilterCondition =
    | { type: 'grade'; value: string }
    | { type: 'subjectId'; value: string }
    | { type: 'coreProblemId'; value: string }
    | { type: 'search'; value: string }
    | { type: 'video'; value: 'exists' | 'none' };

const SEARCH_SCALAR_FIELDS = ['question', 'answer', 'customId'] as const;

function buildFilterConditions(
    filters: ProblemFilters,
    search?: string
): FilterCondition[] {
    const conditions: FilterCondition[] = [];

    if (filters.grade) {
        conditions.push({ type: 'grade', value: filters.grade });
    }
    if (filters.subjectId) {
        conditions.push({ type: 'subjectId', value: filters.subjectId });
    }
    if (filters.coreProblemId) {
        conditions.push({ type: 'coreProblemId', value: filters.coreProblemId });
    }
    if (filters.video) {
        conditions.push({ type: 'video', value: filters.video });
    }
    if (search) {
        conditions.push({ type: 'search', value: search });
    }
    return conditions;
}

/**
 * 条件をPrisma WhereInput形式に変換
 */
function conditionsToPrismaWhere(conditions: FilterCondition[]): Prisma.ProblemWhereInput {
    const where: Prisma.ProblemWhereInput = {};
    const andConditions: Prisma.ProblemWhereInput[] = [];

    for (const cond of conditions) {
        switch (cond.type) {
            case 'grade':
                where.grade = cond.value;
                break;
            case 'subjectId':
                andConditions.push({
                    coreProblems: { some: { subjectId: cond.value } }
                });
                break;
            case 'coreProblemId':
                andConditions.push({
                    coreProblems: { some: { id: cond.value } }
                });
                break;
            case 'video':
                if (cond.value === 'exists') {
                    // videoUrl is not null AND videoUrl is not empty string
                    andConditions.push({
                        videoUrl: { not: null },
                    });
                    andConditions.push({
                        videoUrl: { not: '' }
                    });
                } else {
                    // videoUrl is null OR videoUrl is empty string
                    andConditions.push({
                        OR: [
                            { videoUrl: null },
                            { videoUrl: '' }
                        ]
                    });
                }
                break;
            case 'search':
                where.OR = [
                    ...SEARCH_SCALAR_FIELDS.map(field => ({
                        [field]: { contains: cond.value, mode: 'insensitive' as const }
                    })),
                    {
                        coreProblems: {
                            some: {
                                name: { contains: cond.value, mode: 'insensitive' }
                            }
                        }
                    },
                ];
                break;
        }
    }

    if (andConditions.length > 0) {
        where.AND = andConditions;
    }

    return where;
}
// 後方互換性のためのラッパー関数
function buildProblemWhere(filters: ProblemFilters, search?: string): Prisma.ProblemWhereInput {
    const conditions = buildFilterConditions(filters, search);
    return conditionsToPrismaWhere(conditions);
}

export async function getProblems(
    page: number = 1,
    limit: number = 20,
    search: string = '',
    filters: ProblemFilters = {},
    sortBy: 'updatedAt' | 'createdAt' | 'customId' | 'masterNumber' = 'updatedAt',
    sortOrder: 'asc' | 'desc' = 'desc'
) {
    await requireAdmin();
    try {
        const normalizedSearch = search.trim();
        const where = buildProblemWhere(filters, normalizedSearch || undefined);
        const include = {
            coreProblems: {
                include: {
                    subject: true
                }
            }
        } satisfies Prisma.ProblemInclude;

        const skip = (page - 1) * limit;
        const orderBy: Prisma.ProblemOrderByWithRelationInput[] =
            sortBy === 'createdAt'
                ? [{ createdAt: sortOrder }, { id: 'asc' }]
                : sortBy === 'masterNumber'
                    ? [{ masterNumber: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }]
                    : sortBy === 'customId'
                        ? [{ customId: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }]
                        : [{ updatedAt: sortOrder }, { id: 'asc' }];

        const [problems, total] = await Promise.all([
            prisma.problem.findMany({
                where,
                include,
                orderBy,
                skip,
                take: limit,
            }),
            prisma.problem.count({ where }),
        ]);

        return { success: true, problems, total, page, limit };
    } catch (error) {
        console.error('Failed to get problems:', error);
        return { error: '問題の取得に失敗しました' };
    }
}

export async function createStandaloneProblem(data: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    masterNumber?: number;
    videoUrl?: string;
    coreProblemIds: string[];
}) {
    await requireAdmin();
    try {
        const problem = await createProblemCore({
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
            masterNumber: data.masterNumber,
            videoUrl: data.videoUrl,
            coreProblemIds: data.coreProblemIds,
            order: 0,
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
    masterNumber?: number;
    videoUrl?: string;
    coreProblemIds?: string[];
}) {
    await requireAdmin();
    try {
        const updateData: Prisma.ProblemUpdateInput = {
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
            masterNumber: data.masterNumber,
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

        revalidatePath('/admin/problems');
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to update problem:', error);
        return { error: '問題の更新に失敗しました' };
    }
}

// ...

export async function bulkCreateStandaloneProblems(problems: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    masterNumber?: number;
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

export async function bulkUpsertStandaloneProblems(problems: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    masterNumber?: number;
    videoUrl?: string;
    coreProblemIds: string[];
}[]) {
    await requireAdmin();
    try {
        const { createdCount, updatedCount, warnings } = await bulkUpsertProblemsCore(
            problems,
            { batchSize: 50, assignOrder: false }
        );

        revalidatePath('/admin/problems');
        return { success: true, createdCount, updatedCount, warnings };
    } catch (error) {
        console.error('Failed to bulk upsert problems:', error);
        return { error: '一括登録・更新に失敗しました' };
    }
}

export async function searchProblemsByMasterNumbers(masterNumbers: number[]) {
    await requireAdmin();
    try {
        if (masterNumbers.length === 0) return { success: true, problems: [] };

        const problems = await prisma.problem.findMany({
            where: { masterNumber: { in: masterNumbers } },
            include: {
                coreProblems: {
                    include: { subject: true }
                }
            }
        });

        return {
            success: true, problems: problems.map(p => ({
                ...p,
            }))
        };
    } catch (error) {
        console.error('Failed to search problems by master numbers:', error);
        return { error: '既存問題の検索に失敗しました' };
    }
}
