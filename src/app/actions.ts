"use server";

import { getSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProblemData } from "@/components/learning-session";
import { recordGradingResult } from "@/lib/grading-service";


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

    await recordGradingResult(userId, problemId, evaluation);
}

export async function submitAnswerWithAI(
    problemId: string,
    studentAnswer: string
): Promise<{ aiGraded: boolean; feedback?: string; evaluation?: string }> {
    const session = await requireAuth();

    try {
        const { gradeTextAnswer } = await import("@/lib/grading-service");
        const result = await gradeTextAnswer(problemId, studentAnswer);

        // Optionally record the result immediately?
        // For now, we just return the AI feedback and let the user confirm/save.
        // Or we can save it as "AI evaluated" but not "finalized".
        // The UI flow suggests the user confirms the evaluation.

        return {
            aiGraded: true,
            feedback: result.feedback,
            evaluation: result.evaluation
        };
    } catch (error) {
        console.error("AI Grading Error:", error);
        return { aiGraded: false };
    }
}
