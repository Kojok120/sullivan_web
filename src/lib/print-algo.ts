import { prisma } from "@/lib/prisma";
import { Problem, UserProblemState, CoreProblem, UserCoreProblemState } from "@prisma/client";

import { calculateCoreProblemStatus } from "@/lib/progression";

export const PRINT_CONFIG = {
    // Weights for scoring
    WEIGHT_TIME: 2.0,       // Priority for forgetting (time elapsed)
    WEIGHT_WEAKNESS: 1.0,   // Priority for weakness (low accuracy/evaluation)
    WEIGHT_UNANSWERED: 1.5, // Priority for new/unanswered problems
    WEIGHT_CORE_PRIORITY: 1.0, // Priority from CoreProblem points

    // Forgetting curve settings
    FORGETTING_RATE: 5.0,   // Points per day elapsed
};

// Shared Helper is now in @/lib/progression
// export function isCoreProblemPassed... (Removed)

type ScoredProblem = {
    problem: Problem;
    score: number;
    reason: 'forgetting' | 'weakness' | 'new' | 'priority';
};

export async function selectProblemsForPrint(
    userId: string,
    subjectId: string,
    count: number = 30
): Promise<Problem[]> {
    // 1. Fetch all CoreProblems for the subject, ordered by order
    const coreProblems = await prisma.coreProblem.findMany({
        where: { subjectId },
        orderBy: { order: 'asc' },
        include: {
            problems: {
                select: { id: true } // Just to count total problems
            },
            userStates: {
                where: { userId }
            }
        }
    });

    if (coreProblems.length === 0) return [];

    // 2. Determine Unlocked CoreProblems
    // We need to calculate proficiency for each CoreProblem to determine if the NEXT one is unlocked.
    // Or simply check if the current one is unlocked based on the PREVIOUS one's proficiency.

    // We need to fetch UserProblemStates to calculate proficiency.
    // This might be heavy if we fetch ALL states. 
    // Optimization: Fetch stats aggregated? Prisma doesn't support complex aggregation easily with relations.
    // Let's fetch all UserProblemStates for this subject's problems.

    const allProblemIds = coreProblems.flatMap(cp => cp.problems.map(p => p.id));
    const userProblemStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: allProblemIds }
        }
    });

    const problemStateMap = new Map(userProblemStates.map(s => [s.problemId, s]));

    // Calculate proficiency per CoreProblem
    const coreProblemStats = new Map<string, { answerRate: number, correctRate: number, isCleared: boolean }>();

    for (const cp of coreProblems) {
        const totalProblems = cp.problems.length;
        if (totalProblems === 0) {
            coreProblemStats.set(cp.id, { answerRate: 0, correctRate: 0, isCleared: false });
            continue;
        }

        const cpProblemIds = cp.problems.map(p => p.id);
        const answeredCount = cpProblemIds.filter(pid => problemStateMap.has(pid)).length;

        // Correct count: "正解したユニークな問題数"
        const correctCount = cpProblemIds.filter(pid => problemStateMap.get(pid)?.isCleared).length;

        const { isPassed, answerRate, correctRate } = calculateCoreProblemStatus(totalProblems, answeredCount, correctCount);
        const isCleared = isPassed;

        coreProblemStats.set(cp.id, { answerRate, correctRate, isCleared });
    }

    // Determine unlocked status
    // CoreProblem 1 is always unlocked.
    // CoreProblem N is unlocked if CoreProblem N-1 is cleared.
    const unlockedCoreProblemIds = new Set<string>();

    for (let i = 0; i < coreProblems.length; i++) {
        const cp = coreProblems[i];
        if (i === 0) {
            unlockedCoreProblemIds.add(cp.id);
        } else {
            const prevCp = coreProblems[i - 1];
            const prevStats = coreProblemStats.get(prevCp.id);
            if (prevStats && prevStats.isCleared) {
                unlockedCoreProblemIds.add(cp.id);
            } else {
                const userState = cp.userStates[0]; // Since we filtered by userId
                if (userState?.isUnlocked) {
                    unlockedCoreProblemIds.add(cp.id);
                } else {
                    break; // Stop unlocking
                }
            }
        }
    }

    // 3. Fetch Candidate Problems
    const candidateProblems = await prisma.problem.findMany({
        where: {
            coreProblems: {
                some: {
                    id: { in: Array.from(unlockedCoreProblemIds) }
                }
            }
        },
        include: {
            coreProblems: true
        }
    });

    // Filter: ALL CoreProblems must be unlocked
    const validProblems = candidateProblems.filter(p => {
        return p.coreProblems.every(cp => unlockedCoreProblemIds.has(cp.id));
    });

    if (validProblems.length === 0) return [];

    // Optimization: Pre-calculate CP Priorities to Map
    const cpPriorityMap = new Map<string, number>();
    for (const cp of coreProblems) {
        const cpState = cp.userStates[0];
        if (cpState) {
            cpPriorityMap.set(cp.id, cpState.priority);
        }
    }

    // 4. Calculate Score
    const scoredProblems: ScoredProblem[] = validProblems.map(problem => {
        const state = problemStateMap.get(problem.id);
        let score = 0;

        // Base Score: CoreProblem Priorities
        let cpPrioritySum = 0;
        for (const cp of problem.coreProblems) {
            const priority = cpPriorityMap.get(cp.id) || 0;
            cpPrioritySum += priority;
        }

        const priorityScore = cpPrioritySum * PRINT_CONFIG.WEIGHT_CORE_PRIORITY;
        score += priorityScore;

        if (!state) {
            // Unanswered
            score += 100 * PRINT_CONFIG.WEIGHT_UNANSWERED;
            score -= problem.order * 0.1; // Slight preference for order
        } else {
            // Answered
            const now = new Date();
            const lastAnswered = state.lastAnsweredAt || new Date(0);
            const diffMs = now.getTime() - lastAnswered.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            const timeScore = diffDays * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME;
            score += timeScore;
        }

        // reason not used anymore
        return { problem, score, reason: 'new' };
    });

    // 5. Sort by score descending
    scoredProblems.sort((a, b) => b.score - a.score);

    // 6. Select top 'count'
    return scoredProblems.slice(0, count).map(sp => sp.problem);
}
