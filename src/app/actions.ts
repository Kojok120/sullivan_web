"use server";

import { getSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateNewPriority, calculateEffectivePriority } from "@/lib/priority-algo";
import { ProblemData } from "@/components/learning-session";
import { getSystemConfig } from "@/lib/system-settings";

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

export async function getNextProblem(userId: string, coreProblemId: string): Promise<ProblemData | null> {
    const config = await getSystemConfig();

    // 1. まだ回答していない問題をDB側で最小カラムだけ取得（最優先はチェーン順）
    const unanswered = await prisma.problem.findFirst({
        where: {
            coreProblemId,
            userStates: { none: { userId } },
        },
        orderBy: { order: "asc" },
        select: {
            id: true,
            question: true,
            answer: true,
            coreProblemId: true,
            videoUrl: true,
            difficulty: true,
            aiGradingEnabled: true,
            coreProblem: {
                select: {
                    name: true,
                    unit: { select: { name: true } },
                },
            },
        },
    });

    if (unanswered) {
        return {
            id: unanswered.id,
            question: unanswered.question,
            answer: unanswered.answer,
            coreProblemId: unanswered.coreProblemId,
            videoUrl: unanswered.videoUrl,
            difficulty: unanswered.difficulty ?? undefined,
            aiGradingEnabled: unanswered.aiGradingEnabled,
            coreProblemName: unanswered.coreProblem.name,
            unitName: unanswered.coreProblem.unit.name,
        };
    }

    // 2. 全て回答済みなら、回答済み問題のみを取得して優先度計算
    const answeredStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problem: { coreProblemId },
        },
        include: {
            problem: {
                select: {
                    id: true,
                    question: true,
                    answer: true,
                    coreProblemId: true,
                    videoUrl: true,
                    difficulty: true,
                    aiGradingEnabled: true,
                    order: true,
                    coreProblem: {
                        select: {
                            name: true,
                            unit: { select: { name: true } },
                        },
                    },
                },
            },
        },
    });

    if (answeredStates.length === 0) return null;

    // 記憶効果込みの優先度が最も高いものを選ぶ
    const selected = answeredStates.reduce<typeof answeredStates[number] | null>((best, current) => {
        const currentPriority = calculateEffectivePriority(current.priority, current.lastAnsweredAt, config);
        if (!best) return current;
        const bestPriority = calculateEffectivePriority(best.priority, best.lastAnsweredAt, config);
        return currentPriority > bestPriority ? current : best;
    }, null);

    if (!selected) return null;

    return {
        id: selected.problem.id,
        question: selected.problem.question,
        answer: selected.problem.answer,
        coreProblemId: selected.problem.coreProblemId,
        videoUrl: selected.problem.videoUrl,
        difficulty: selected.problem.difficulty ?? undefined,
        aiGradingEnabled: selected.problem.aiGradingEnabled,
        coreProblemName: selected.problem.coreProblem.name,
        unitName: selected.problem.coreProblem.unit.name,
    };
}



export async function submitEvaluation(
    userId: string,
    problemId: string,
    evaluation: "A" | "B" | "C" | "D"
): Promise<void> {
    // 1. Record History
    await prisma.learningHistory.create({
        data: {
            userId,
            problemId,
            evaluation,
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

    // 3. Fetch system config
    const config = await getSystemConfig();

    // 4. Calculate new base priority using the unified logic with config
    const newPriority = calculateNewPriority(currentPriority, evaluation, config);

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

import { gradeAnswer } from "@/lib/gemini";

export async function submitAnswerWithAI(
    problemId: string,
    userAnswer: string
) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const userId = session.userId;

    // 1. Fetch problem and system settings
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });

    const settings = await prisma.systemSettings.findFirst();
    const isAiEnabledSystem = settings?.aiGradingEnabled ?? false;

    // Derive config from settings or use default
    const { toPriorityConfig } = await import("@/lib/system-settings");
    const config = toPriorityConfig(settings);

    if (!problem) throw new Error("Problem not found");

    let evaluation: "A" | "B" | "C" | "D" = "C"; // Default
    let feedback = "";

    if (isAiEnabledSystem) {
        // AI Grading
        const result = await gradeAnswer(problem.question, problem.answer, userAnswer);
        evaluation = result.evaluation;
        feedback = result.feedback;
    }

    // 2. Record History
    await prisma.learningHistory.create({
        data: {
            userId,
            problemId,
            evaluation,
            userAnswer,
            feedback,
        },
    });

    // 3. Update UserProblemState
    const currentState = await prisma.userProblemState.findUnique({
        where: {
            userId_problemId: {
                userId,
                problemId,
            },
        },
    });

    const currentPriority = currentState?.priority || 0;
    const newPriority = calculateNewPriority(currentPriority, evaluation, config);

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
