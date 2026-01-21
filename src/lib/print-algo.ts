import { prisma } from "@/lib/prisma";
import { Problem } from "@prisma/client";
import { getUnlockedCoreProblemIds } from "@/lib/progression";

export const PRINT_CONFIG = {
    // Weights for scoring
    WEIGHT_TIME: 2.0,       // Priority for forgetting (time elapsed)
    WEIGHT_WEAKNESS: 1.0,   // Priority for weakness (low accuracy/evaluation)
    WEIGHT_UNANSWERED: 1.5, // Priority for new/unanswered problems
    WEIGHT_CORE_PRIORITY: 1.0, // Priority from CoreProblem points

    // Forgetting curve settings
    FORGETTING_RATE: 5.0,   // Points per day elapsed
};

type ScoredProblem = {
    problem: Problem;
    score: number;
    reason: 'forgetting' | 'weakness' | 'new' | 'priority';
};

export async function selectProblemsForPrint(
    userId: string,
    subjectId: string,
    coreProblemId?: string,
    count: number = 30
): Promise<Problem[]> {

    // 1. Determine Unlocked CoreProblems
    // Unified Logic via progression.ts
    const unlockedCoreProblemIds = await getUnlockedCoreProblemIds(userId, subjectId);

    // If a specific CoreProblem is requested, check if it's unlocked (optional, depending on strictness)
    // For now, we allow printing even if locked? No, "unlocked only" was in spec "鍵がかかっている...グレーアウト".
    // Theoretically the UI prevents it, but good to be safe.
    // If a specific CoreProblem is requested, we allow printing even if it is locked.
    // So we skip the early return check.

    // 2. Fetch Candidate Problems
    // If coreProblemId is set, filter by that.
    const whereCondition: any = {
        coreProblems: {
            some: {
                id: coreProblemId // If specific unit, get problems for it (regardless of lock)
                    ? coreProblemId
                    : { in: Array.from(unlockedCoreProblemIds) } // Otherwise, unlocked only
            }
        }
    };
    // Note: Previous code was manually constructing whereCondition differently, but this is cleaner.
    // However, let's respect the existing structure if possible or just replace the block.
    // existing structure used whereCondition object.

    const candidateProblems = await prisma.problem.findMany({
        where: whereCondition,
        include: {
            coreProblems: {
                include: { userStates: { where: { userId } } }
            }
        }
    });

    // Filter logic
    const validProblems = candidateProblems.filter(p => {
        // If specific unit is requested, we accept the problem if it belongs to that unit.
        // We don't care if it belongs to OTHER locked units (shared problems).
        if (coreProblemId) {
            return p.coreProblems.some(cp => cp.id === coreProblemId);
        }

        // Standard case: ALL CoreProblems must be unlocked
        return p.coreProblems.every(cp => unlockedCoreProblemIds.has(cp.id));
    });

    if (validProblems.length === 0) return [];

    // 3. Fetch User State for these problems (for scoring)
    const validProblemIds = validProblems.map(p => p.id);
    const userProblemStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: validProblemIds }
        }
    });
    const problemStateMap = new Map(userProblemStates.map(s => [s.problemId, s]));

    // 4. Calculate Score
    const scoredProblems: ScoredProblem[] = validProblems.map(problem => {
        const state = problemStateMap.get(problem.id);
        let score = 0;

        // Base Score: CoreProblem Priorities
        let cpPrioritySum = 0;
        for (const cp of problem.coreProblems) {
            const cpState = cp.userStates[0];
            const priority = cpState ? cpState.priority : 0;
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

        return { problem, score, reason: 'new' };
    });

    // 5. Sort by score descending
    scoredProblems.sort((a, b) => b.score - a.score);

    // 6. Select top 'count'
    return scoredProblems.slice(0, count).map(sp => sp.problem);
}
