import { prisma } from '@/lib/prisma';

// Configuration for progression/unlock thresholds
export const UNLOCK_ANSWER_RATE = 0.5; // 50%
export const UNLOCK_CORRECT_RATE = 0.6; // 60%

export type CoreProblemStatus = {
    isPassed: boolean;
    answerRate: number;
    correctRate: number;
};

/**
 * Calculates the progress status of a CoreProblem.
 * 
 * @param totalProblems Total number of problems in the CoreProblem
 * @param answeredCount Number of unique problems answered (at least once)
 * @param correctCount Number of unique problems answered correctly (isCleared=true)
 * @returns CoreProblemStatus
 */
export function calculateCoreProblemStatus(
    totalProblems: number,
    answeredCount: number,
    correctCount: number
): CoreProblemStatus {
    if (totalProblems === 0) {
        return { isPassed: false, answerRate: 0, correctRate: 0 };
    }

    const answerRate = answeredCount / totalProblems;
    // Correct rate is based on ANSWERED problems, not total problems.
    // "正解したユニークな問題数 / 一度でも解いた問題数"
    const correctRate = answeredCount > 0 ? correctCount / answeredCount : 0;

    const isPassed = answerRate >= UNLOCK_ANSWER_RATE && correctRate >= UNLOCK_CORRECT_RATE;

    return {
        isPassed,
        answerRate,
        correctRate
    };
}

/**
 * Retrieves the set of unlocked CoreProblem IDs for a user in a specific subject.
 * Relies primarily on the 'UserCoreProblemState.isUnlocked' flag.
 * Ensures the first CoreProblem is always unlocked.
 */
export async function getUnlockedCoreProblemIds(userId: string, subjectId: string): Promise<Set<string>> {
    // 1. Fetch all CoreProblems for the subject to identify the first one
    const coreProblems = await prisma.coreProblem.findMany({
        where: { subjectId },
        orderBy: { order: 'asc' },
        select: { id: true, order: true }
    });

    if (coreProblems.length === 0) return new Set();

    // 2. Fetch User States
    const userStates = await prisma.userCoreProblemState.findMany({
        where: {
            userId,
            coreProblemId: { in: coreProblems.map(cp => cp.id) },
            isUnlocked: true
        },
        select: { coreProblemId: true }
    });

    const unlockedIds = new Set(userStates.map(s => s.coreProblemId));

    // 3. Ensure First CP is Unlocked
    // We assume the one with lowest order is the first.
    if (coreProblems.length > 0) {
        unlockedIds.add(coreProblems[0].id);
    }

    return unlockedIds;
}
