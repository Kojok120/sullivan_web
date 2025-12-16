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
    count: number = 30
): Promise<Problem[]> {

    // 1. Determine Unlocked CoreProblems
    // Unified Logic via progression.ts
    const unlockedCoreProblemIds = await getUnlockedCoreProblemIds(userId, subjectId);

    // 2. Fetch Candidate Problems
    const candidateProblems = await prisma.problem.findMany({
        where: {
            coreProblems: {
                some: {
                    id: { in: Array.from(unlockedCoreProblemIds) }
                }
            }
        },
        include: {
            coreProblems: {
                include: { userStates: { where: { userId } } }
            }
        }
    });

    // Filter: ALL CoreProblems must be unlocked
    const validProblems = candidateProblems.filter(p => {
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
    // Note: 'problem' in ScoredProblem includes 'coreProblems', but we return strict Problem[] type.
    // The caller might expect vanilla Problem, or Problem with coreProblems.
    // The previous implementation returned `sp.problem`.
    // The `validProblems` have `coreProblems` included. This is usually fine to pass as Problem in Prisma world (type superset).
    // But to be clean we can return as is.
    return scoredProblems.slice(0, count).map(sp => sp.problem);
}
