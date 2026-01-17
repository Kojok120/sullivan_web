'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { bulkCreateProblemsCore, createProblemCore, deleteProblemsWithRelations } from '@/lib/problem-service';

// --- Subjects ---
export async function getSubjects() {
    await requireAdmin();
    try {
        const { fetchSubjects } = await import('@/lib/curriculum-service');
        // Updated fetchSubjects should handle includeCoreProblems correctly without Units
        const subjects = await fetchSubjects({ includeCoreProblems: true });
        return { success: true, subjects: subjects as any };
    } catch (error) {
        console.error('Failed to fetch subjects:', error);
        return { error: '科目の取得に失敗しました' };
    }
}

// --- CoreProblems ---
export async function createCoreProblem(data: { name: string; subjectId: string; order: number }) {
    await requireAdmin();
    try {
        const coreProblem = await prisma.coreProblem.create({
            data: {
                name: data.name,
                subjectId: data.subjectId,
                order: data.order,
            },
        });
        revalidatePath('/admin/curriculum');
        return { success: true, coreProblem };
    } catch (error) {
        console.error('Failed to create core problem:', error);
        return { error: 'CoreProblemの作成に失敗しました' };
    }
}

export async function updateCoreProblem(id: string, data: { name?: string; order?: number }) {
    await requireAdmin();
    try {
        const coreProblem = await prisma.coreProblem.update({
            where: { id },
            data,
        });
        revalidatePath('/admin/curriculum');
        return { success: true, coreProblem };
    } catch (error) {
        console.error('Failed to update core problem:', error);
        return { error: 'CoreProblemの更新に失敗しました' };
    }
}

export async function deleteCoreProblem(id: string) {
    await requireAdmin();
    try {
        await prisma.coreProblem.delete({ where: { id } });
        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete core problem:', error);
        return { error: 'CoreProblemの削除に失敗しました' };
    }
}

export async function bulkDeleteCoreProblems(ids: string[]) {
    await requireAdmin();
    try {
        if (ids.length === 0) return { success: true, count: 0 };

        const result = await prisma.coreProblem.deleteMany({
            where: { id: { in: ids } }
        });

        revalidatePath('/admin/curriculum');
        return { success: true, count: result.count };
    } catch (error) {
        console.error('Failed to bulk delete core problems:', error);
        return { error: 'コア問題の一括削除に失敗しました' };
    }
}

export async function bulkCreateCoreProblems(subjectId: string, names: string[]) {
    await requireAdmin();
    try {
        // Filter unique names locally first
        const uniqueNames = Array.from(new Set(names));

        // Find existing names in this subject
        const existingProblems = await prisma.coreProblem.findMany({
            where: {
                subjectId,
                name: { in: uniqueNames }
            },
            select: { name: true }
        });
        const existingNameSet = new Set(existingProblems.map(p => p.name));

        const newNames = uniqueNames.filter(name => !existingNameSet.has(name));

        if (newNames.length === 0) {
            return { success: true, count: 0, warnings: ['全てのCoreProblemは既に存在します'] };
        }

        // Determine start order
        const lastProblem = await prisma.coreProblem.findFirst({
            where: { subjectId },
            orderBy: { order: 'desc' }
        });
        let order = (lastProblem?.order || 0) + 1;

        await prisma.$transaction(
            newNames.map(name =>
                prisma.coreProblem.create({
                    data: {
                        name,
                        subjectId,
                        order: order++
                    }
                })
            )
        );

        revalidatePath('/admin/curriculum');

        const warnings = existingNameSet.size > 0
            ? [`${existingNameSet.size}件のCoreProblemは既に存在するためスキップされました`]
            : [];

        return { success: true, count: newNames.length, warnings };
    } catch (error) {
        console.error('Failed to bulk create core problems:', error);
        return { error: '一括登録に失敗しました' };
    }
}

export async function reorderCoreProblems(items: { id: string, order: number }[]) {
    await requireAdmin();
    try {
        await prisma.$transaction(
            items.map((item) =>
                prisma.coreProblem.update({
                    where: { id: item.id },
                    data: { order: item.order },
                })
            )
        );
        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to reorder core problems:', error);
        return { error: 'CoreProblemの並び替えに失敗しました' };
    }
}

// --- Problems ---
export async function getProblemsByCoreProblem(coreProblemId: string) {
    await requireAdmin();
    try {
        // Problem now has many-to-many with CoreProblem.
        // We need to find problems that have this coreProblemId in their coreProblems list.
        const problems = await prisma.problem.findMany({
            where: {
                coreProblems: {
                    some: { id: coreProblemId }
                }
            },
            orderBy: { order: 'asc' },
        });
        return { success: true, problems };
    } catch (error) {
        console.error('Failed to fetch problems:', error);
        return { error: '問題の取得に失敗しました' };
    }
}

export async function createProblem(data: {
    question: string;
    answer?: string;
    coreProblemId: string; // Primary CoreProblem to link
    order: number;

    videoUrl?: string;
    acceptedAnswers?: string[];
    grade?: string;
}) {
    await requireAdmin();
    try {
        const problem = await createProblemCore({
            question: data.question,
            answer: data.answer,
            coreProblemIds: [data.coreProblemId],
            order: data.order,
            videoUrl: data.videoUrl,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
        });
        revalidatePath('/admin/curriculum');
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to create problem:', error);
        return { error: '問題の作成に失敗しました' };
    }
}

export async function updateProblem(id: string, data: {
    question?: string;
    answer?: string;
    order?: number;
    videoUrl?: string;
    acceptedAnswers?: string[];
    grade?: string;
}) {
    await requireAdmin();
    try {
        const problem = await prisma.problem.update({
            where: { id },
            data: {
                question: data.question,
                answer: data.answer,
                order: data.order,
                videoUrl: data.videoUrl,
                acceptedAnswers: data.acceptedAnswers,
                grade: data.grade,
            },
        });
        revalidatePath('/admin/curriculum');
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to update problem:', error);
        return { error: '問題の更新に失敗しました' };
    }
}

export async function deleteProblem(id: string) {
    await requireAdmin();
    try {
        await deleteProblemsWithRelations([id]);
        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete problem:', error);
        return { error: '問題の削除に失敗しました' };
    }
}

export async function reorderProblems(items: { id: string, order: number }[]) {
    await requireAdmin();
    try {
        await prisma.$transaction(
            items.map((item) =>
                prisma.problem.update({
                    where: { id: item.id },
                    data: { order: item.order },
                })
            )
        );
        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to reorder problems:', error);
        return { error: '問題の並び替えに失敗しました' };
    }
}

export async function bulkCreateProblems(subjectId: string, problems: {
    question: string;
    answer?: string;
    videoUrl?: string;
    grade?: string;
    acceptedAnswers?: string[];
    coreProblemIds: string[];
}[]) {
    await requireAdmin();
    try {
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            select: { id: true }
        });

        if (!subject) throw new Error('Subject not found');

        const { count, warnings } = await bulkCreateProblemsCore(
            problems.map(p => ({ ...p, subjectId })),
            { subjectId, assignOrder: true }
        );

        revalidatePath('/admin/curriculum');
        return { success: true, count, warnings };
    } catch (error) {
        console.error('Failed to bulk create problems:', error);
        return { error: '一括登録に失敗しました' };
    }
}
