'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';

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
    answer: string;
    coreProblemId: string; // Primary CoreProblem to link
    order: number;

    videoUrl?: string;
    acceptedAnswers?: string[];
    difficulty?: number; // Removed from schema but kept in args? No, schema removed it.
    grade?: string;
    tags?: string[]; // Removed from schema
    attributes?: any; // Removed from schema
}) {
    await requireAdmin();
    try {
        // 1. Fetch Subject info via CoreProblem
        const coreProblem = await prisma.coreProblem.findUnique({
            where: { id: data.coreProblemId },
            include: { subject: true }
        });

        if (!coreProblem) throw new Error('CoreProblem not found');

        const subject = coreProblem.subject;

        // 2. Generate Custom ID
        const { generateCustomId } = await import('@/lib/curriculum-service');
        const customId = await generateCustomId(subject.id);

        const problem = await prisma.problem.create({
            data: {
                question: data.question,
                answer: data.answer,
                // Connect to CoreProblem
                coreProblems: {
                    connect: { id: data.coreProblemId }
                },
                order: data.order,
                videoUrl: data.videoUrl,
                acceptedAnswers: data.acceptedAnswers || [],
                grade: data.grade,
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
    videoUrl?: string;
    acceptedAnswers?: string[];
    grade?: string;
    // Removed difficulty, tags, attributes
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
    grade?: string;
    acceptedAnswers?: string[];
}[]) {
    await requireAdmin();
    try {
        // 1. Fetch Subject info
        const coreProblem = await prisma.coreProblem.findUnique({
            where: { id: coreProblemId },
            include: { subject: true }
        });

        if (!coreProblem) throw new Error('CoreProblem not found');

        const subject = coreProblem.subject;

        // 2. Generate Custom IDs
        const { generateCustomId } = await import('@/lib/curriculum-service');

        // Get current max order
        // We need to check problems linked to this CoreProblem
        const currentProblems = await prisma.problem.findMany({
            where: {
                coreProblems: {
                    some: { id: coreProblemId }
                }
            },
            select: { order: true },
            orderBy: { order: 'desc' },
            take: 1,
        });
        let startOrder = (currentProblems[0]?.order || 0) + 1;

        // Pre-calculate IDs
        const problemsWithIds = await Promise.all(problems.map(async (p, index) => {
            const customId = await generateCustomId(subject.id, index);
            return { ...p, customId, order: startOrder + index };
        }));

        // Create problems in transaction
        // Note: Prisma createMany doesn't support relations (many-to-many connect).
        // So we must use create one by one or nested create.
        // We can use $transaction with multiple create calls.
        await prisma.$transaction(
            problemsWithIds.map(p =>
                prisma.problem.create({
                    data: {
                        coreProblems: {
                            connect: { id: coreProblemId }
                        },
                        question: p.question,
                        answer: p.answer,
                        videoUrl: p.videoUrl,
                        grade: p.grade,
                        acceptedAnswers: p.acceptedAnswers || [],
                        order: p.order,
                        customId: p.customId,
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
