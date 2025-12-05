"use server";

import { getSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateNewPriority } from "@/lib/priority-algo";
import { ProblemData } from "@/components/learning-session";


export async function logoutAction() {
    await logout();
    redirect("/login");
}

export async function getSubjects() {
    const { fetchSubjects } = await import('@/lib/curriculum-service');
    return await fetchSubjects();
}

export async function getSubject(id: string) {
    return await prisma.subject.findUnique({
        where: { id },
        include: {
            units: {
                orderBy: { order: 'asc' },
                include: {
                    coreProblems: {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });
}

export async function getUnitsBySubject(subjectId: string) {
    return await prisma.unit.findMany({
        where: { subjectId },
        orderBy: { order: 'asc' },
        include: {
            coreProblems: {
                orderBy: { order: 'asc' },
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
}

async function requireAuth() {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized');
    }
    return session;
}

// Helper to record history and update priority
async function recordProblemResult(
    userId: string,
    problemId: string,
    evaluation: "A" | "B" | "C" | "D",
    userAnswer?: string,
    feedback?: string
) {
    // 1. Record History
    await prisma.learningHistory.create({
        data: {
            userId,
            problemId,
            evaluation,
            userAnswer,
            feedback,
        },
    });

    // 2. Update UserProblemState
    const currentState = await prisma.userProblemState.findUnique({
        where: {
            userId_problemId: {
                userId,
                problemId,
            },
        },
    });

    const currentPriority = currentState?.priority || 0;

    // 3. Calculate new base priority using the unified logic (using default config)
    const newPriority = calculateNewPriority(currentPriority, evaluation);

    await prisma.userProblemState.upsert({
        where: {
            userId_problemId: {
                userId,
                problemId,
            },
        },
        update: {
            priority: newPriority,
            lastAnsweredAt: new Date(),
        },
        create: {
            userId,
            problemId,
            priority: newPriority,
            lastAnsweredAt: new Date(),
        },
    });
}

export async function getNextProblem(userId: string, coreProblemId: string): Promise<ProblemData | null> {
    const session = await requireAuth();
    if (session.userId !== userId && session.role !== 'ADMIN' && session.role !== 'TEACHER') {
        throw new Error('Unauthorized access to other user data');
    }

    const { selectNextProblem } = await import("@/lib/priority-algo");

    // 1. Fetch all problems for this CoreProblem (lightweight)
    const problems = await prisma.problem.findMany({
        where: { coreProblemId },
        include: {
            coreProblem: {
                select: {
                    name: true,
                    unit: { select: { name: true } },
                },
            },
        },
    });

    if (problems.length === 0) return null;

    // 2. Fetch user states for these problems
    const userStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: problems.map(p => p.id) },
        },
    });

    // 3. Use shared logic to select (using default config)
    const selected = selectNextProblem(problems, userStates);

    if (!selected) return null;

    return {
        id: selected.id,
        question: selected.question,
        answer: selected.answer,
        coreProblemId: selected.coreProblemId,
        videoUrl: selected.videoUrl,
        difficulty: selected.difficulty ?? undefined,
        aiGradingEnabled: selected.aiGradingEnabled,
        coreProblemName: (selected as any).coreProblem.name,
        unitName: (selected as any).coreProblem.unit.name,
    };
}



export async function submitEvaluation(
    userId: string,
    problemId: string,
    evaluation: "A" | "B" | "C" | "D"
): Promise<void> {
    const session = await requireAuth();
    if (session.userId !== userId) {
        throw new Error('Unauthorized');
    }

    await recordProblemResult(userId, problemId, evaluation);
}

import { gradeAnswer } from "@/lib/gemini";

export async function submitAnswerWithAI(
    problemId: string,
    userAnswer: string
) {
    const session = await requireAuth();
    const userId = session.userId;

    // 1. Fetch problem
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });

    // AI Grading is disabled by default as settings are removed. 
    // If needed, we can enable it via environment variable or hardcode.
    const isAiEnabledSystem = false;

    if (!isAiEnabledSystem) {
        return { aiGraded: false };
    }

    if (!problem) throw new Error("Problem not found");

    let evaluation: "A" | "B" | "C" | "D" = "C"; // Default
    let feedback = "";

    if (isAiEnabledSystem) {
        // AI Grading
        const result = await gradeAnswer(problem.question, problem.answer, userAnswer);
        evaluation = result.evaluation;
        feedback = result.feedback;

        // Optional: If we want AI to auto-record, we can do it here.
        // But per review, we should avoid double recording. 
        // If the UI submits evaluation separately, we should just return the feedback here.
        // For now, let's NOT record here and let the user confirm/submit.
        // Or if the UI expects this to record, we need to coordinate.
        // The review says "User evaluation button creates another record".
        // So we should just return the feedback.
    }

    // await recordProblemResult(userId, problemId, evaluation, userAnswer, feedback);

    if (!isAiEnabledSystem) {
        return { aiGraded: false };
    }

    return { aiGraded: true, evaluation, feedback };
}

export async function getUnitsAndCoreProblems() {
    return await prisma.unit.findMany({
        include: {
            coreProblems: {
                orderBy: { order: 'asc' }
            }
        },
        orderBy: { order: 'asc' }
    });
}
