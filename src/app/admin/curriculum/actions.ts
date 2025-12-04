'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { ProblemType } from '@prisma/client';
import { getSession } from '@/lib/auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
}

// --- Subjects ---
export async function getSubjects() {
    await requireAdmin();
    try {
        const { fetchSubjects } = await import('@/lib/curriculum-service');
        const subjects = await fetchSubjects({ includeUnits: true, includeCoreProblems: true });
        return { success: true, subjects: subjects as any };
    } catch (error) {
        console.error('Failed to fetch subjects:', error);
        return { error: '科目の取得に失敗しました' };
    }
}

// --- Units ---
export async function createUnit(data: { name: string; subjectId: string; order: number }) {
    await requireAdmin();
    try {
        const unit = await prisma.unit.create({
            data: {
                name: data.name,
                subjectId: data.subjectId,
                order: data.order,
            },
        });
        revalidatePath('/admin/curriculum');
        return { success: true, unit };
    } catch (error) {
        console.error('Failed to create unit:', error);
        return { error: 'Unitの作成に失敗しました' };
    }
}

export async function updateUnit(id: string, data: { name?: string; order?: number }) {
    await requireAdmin();
    try {
        const unit = await prisma.unit.update({
            where: { id },
            data,
        });
        revalidatePath('/admin/curriculum');
        return { success: true, unit };
    } catch (error) {
        console.error('Failed to update unit:', error);
        return { error: 'Unitの更新に失敗しました' };
    }
}

export async function deleteUnit(id: string) {
    await requireAdmin();
    try {
        await prisma.unit.delete({ where: { id } });
        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete unit:', error);
        return { error: 'Unitの削除に失敗しました' };
    }
}

// --- CoreProblems ---
export async function createCoreProblem(data: { name: string; unitId: string; order: number }) {
    await requireAdmin();
    try {
        const coreProblem = await prisma.coreProblem.create({
            data: {
                name: data.name,
                unitId: data.unitId,
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

// --- Problems ---
export async function getProblemsByCoreProblem(coreProblemId: string) {
    await requireAdmin();
    try {
        const problems = await prisma.problem.findMany({
            where: { coreProblemId },
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
    answer: string;
    coreProblemId: string;
    order: number;
    type?: ProblemType;
    videoUrl?: string;
    acceptedAnswers?: string[];
    difficulty?: number;
    grade?: string;
    tags?: string[];
    attributes?: any;
}) {
    await requireAdmin();
    try {
        // 1. Fetch Subject info to determine prefix
        const coreProblem = await prisma.coreProblem.findUnique({
            where: { id: data.coreProblemId },
            include: { unit: { include: { subject: true } } }
        });

        if (!coreProblem) throw new Error('CoreProblem not found');

        const subject = coreProblem.unit.subject;
        let prefix = '';
        if (subject.name.includes('英語')) prefix = 'E';
        else if (subject.name.includes('国語')) prefix = 'J';
        else if (subject.name.includes('数学')) prefix = 'S';
        else prefix = subject.name.charAt(0).toUpperCase();

        // 2. Count existing problems for this subject to determine next number
        // Note: This is not race-condition safe but sufficient for this scale.
        const count = await prisma.problem.count({
            where: {
                coreProblem: {
                    unit: {
                        subjectId: subject.id
                    }
                }
            }
        });
        const customId = `${prefix}-${count + 1}`;

        const problem = await prisma.problem.create({
            data: {
                question: data.question,
                answer: data.answer,
                coreProblemId: data.coreProblemId,
                order: data.order,
                type: data.type || 'NORMAL',
                videoUrl: data.videoUrl,
                acceptedAnswers: data.acceptedAnswers || [],
                difficulty: data.difficulty,
                grade: data.grade,
                tags: data.tags || [],
                attributes: data.attributes || undefined,
                customId,
            },
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
    type?: ProblemType;
    videoUrl?: string;
    acceptedAnswers?: string[];
    difficulty?: number;
    grade?: string;
    tags?: string[];
    attributes?: any;
}) {
    await requireAdmin();
    try {
        const problem = await prisma.problem.update({
            where: { id },
            data,
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
        await prisma.$transaction([
            // Delete related records first
            prisma.learningHistory.deleteMany({ where: { problemId: id } }),
            prisma.userProblemState.deleteMany({ where: { problemId: id } }),
            // Finally delete the problem
            prisma.problem.delete({ where: { id } }),
        ]);
        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete problem:', error);
        return { error: '問題の削除に失敗しました' };
    }
}

export async function bulkCreateProblems(coreProblemId: string, problems: {
    question: string;
    answer: string;
    videoUrl?: string;
    difficulty?: number;
    grade?: string;
    acceptedAnswers?: string[];
    attributes?: any;
}[]) {
    await requireAdmin();
    try {
        // 1. Fetch Subject info
        const coreProblem = await prisma.coreProblem.findUnique({
            where: { id: coreProblemId },
            include: { unit: { include: { subject: true } } }
        });

        if (!coreProblem) throw new Error('CoreProblem not found');

        const subject = coreProblem.unit.subject;
        let prefix = '';
        if (subject.name.includes('英語')) prefix = 'E';
        else if (subject.name.includes('国語')) prefix = 'J';
        else if (subject.name.includes('数学')) prefix = 'S';
        else prefix = subject.name.charAt(0).toUpperCase();

        // 2. Count existing problems
        const currentCount = await prisma.problem.count({
            where: {
                coreProblem: {
                    unit: {
                        subjectId: subject.id
                    }
                }
            }
        });

        // Get current max order
        const currentProblems = await prisma.problem.findMany({
            where: { coreProblemId },
            select: { order: true },
            orderBy: { order: 'desc' },
            take: 1,
        });
        let startOrder = (currentProblems[0]?.order || 0) + 1;

        // Create problems in transaction
        await prisma.$transaction(
            problems.map((p, index) =>
                prisma.problem.create({
                    data: {
                        coreProblemId,
                        question: p.question,
                        answer: p.answer,
                        videoUrl: p.videoUrl,
                        difficulty: p.difficulty || 1,
                        grade: p.grade,
                        acceptedAnswers: p.acceptedAnswers || [],
                        order: startOrder + index,
                        type: 'NORMAL',
                        attributes: p.attributes || undefined,
                        customId: `${prefix}-${currentCount + index + 1}`,
                    },
                })
            )
        );

        revalidatePath('/admin/curriculum');
        return { success: true };
    } catch (error) {
        console.error('Failed to bulk create problems:', error);
        return { error: '一括登録に失敗しました' };
    }
}
