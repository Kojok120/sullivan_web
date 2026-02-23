'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

import { requireAdmin, getSession } from '@/lib/auth';
import { dedupeByCoreProblemName } from '@/lib/core-problem-import';
import type { LectureVideo } from '@/lib/lecture-videos';

// --- Subjects ---
export async function getSubjects() {
    await requireAdmin();
    try {
        const { fetchSubjects } = await import('@/lib/curriculum-service');
        // Updated fetchSubjects should handle includeCoreProblems correctly without Units
        const subjects = await fetchSubjects({ includeCoreProblems: true });
        return { success: true, subjects };
    } catch (error) {
        console.error('Failed to fetch subjects:', error);
        return { error: '科目の取得に失敗しました' };
    }
}

// --- CoreProblems ---
// 講義動画の型
export type { LectureVideo };

function toLectureVideosJson(videos?: LectureVideo[]): Prisma.InputJsonValue | undefined {
    if (!videos) return undefined;
    return videos as unknown as Prisma.InputJsonValue;
}

export async function getCoreProblemsForSubject(subjectId: string) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'HEAD_TEACHER' && session.role !== 'ADMIN')) {
        return { error: 'Unauthorized' };
    }

    try {
        const coreProblems = await prisma.coreProblem.findMany({
            where: { subjectId },
            orderBy: { order: 'asc' },
            select: { id: true, name: true }
        });
        return { success: true, coreProblems };
    } catch (error) {
        console.error('Failed to get core problems', error);
        return { error: 'Failed to fetch core problems' };
    }
}

export async function createCoreProblem(data: { name: string; subjectId: string; order: number; lectureVideos?: LectureVideo[] }) {
    await requireAdmin();
    try {
        const coreProblem = await prisma.coreProblem.create({
            data: {
                name: data.name,
                subjectId: data.subjectId,
                order: data.order,
                lectureVideos: toLectureVideosJson(data.lectureVideos),
            },
        });
        revalidatePath('/admin/curriculum');
        return { success: true, coreProblem };
    } catch (error) {
        console.error('Failed to create core problem:', error);
        return { error: 'CoreProblemの作成に失敗しました' };
    }
}

export async function updateCoreProblem(id: string, data: { name?: string; order?: number; lectureVideos?: LectureVideo[] }) {
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

export async function bulkCreateCoreProblems(subjectId: string, items: { name: string; lectureVideos?: LectureVideo[] }[]) {
    await requireAdmin();
    try {
        const uniqueItems = dedupeByCoreProblemName(items);

        // Find existing names in this subject
        const existingProblems = await prisma.coreProblem.findMany({
            where: {
                subjectId,
                name: { in: uniqueItems.map(i => i.name) }
            },
            select: { name: true }
        });
        const existingNameSet = new Set(existingProblems.map(p => p.name));

        const newItems = uniqueItems.filter(item => !existingNameSet.has(item.name));

        if (newItems.length === 0) {
            return { success: true, count: 0, warnings: ['全てのCoreProblemは既に存在します'] };
        }

        // Determine start order
        const lastProblem = await prisma.coreProblem.findFirst({
            where: { subjectId },
            orderBy: { order: 'desc' }
        });
        let order = (lastProblem?.order || 0) + 1;

        await prisma.$transaction(
            newItems.map(item =>
                prisma.coreProblem.create({
                    data: {
                        name: item.name,
                        lectureVideos: toLectureVideosJson(item.lectureVideos),
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

        return { success: true, count: newItems.length, warnings };
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
