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

    // 1. Fetch all problems for this CoreProblem
    // Note: Problem <-> CoreProblem is Many-to-Many
    const problems = await prisma.problem.findMany({
        where: {
            coreProblems: {
                some: {
                    id: coreProblemId
                }
            }
        },
        include: {
            coreProblems: {
                select: {
                    id: true,
                    name: true,
                    subject: { select: { name: true } },
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

    // Find the specific core problem info for the requested coreProblemId
    const currentCoreProblem = selected.coreProblems.find(cp => cp.id === coreProblemId) || selected.coreProblems[0];

    return {
        id: selected.id,
        question: selected.question,
        answer: selected.answer,
        coreProblemId: currentCoreProblem.id,
        videoUrl: selected.videoUrl,
        difficulty: undefined, // Removed from schema
        aiGradingEnabled: false, // Removed from schema
        coreProblemName: currentCoreProblem.name,
        unitName: currentCoreProblem.subject.name, // Using Subject name as Unit name replacement
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
