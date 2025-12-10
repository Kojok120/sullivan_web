import { prisma } from "@/lib/prisma";
import { Problem, UserProblemState, CoreProblem, UserCoreProblemState } from "@prisma/client";

import { UNLOCK_ANSWER_RATE, UNLOCK_CORRECT_RATE, calculateCoreProblemStatus } from "@/lib/progression";

export const PRINT_CONFIG = {
    // Weights for scoring
    WEIGHT_TIME: 2.0,       // Priority for forgetting (time elapsed)
    WEIGHT_WEAKNESS: 1.0,   // Priority for weakness (low accuracy/evaluation)
    WEIGHT_UNANSWERED: 1.5, // Priority for new/unanswered problems
    WEIGHT_CORE_PRIORITY: 1.0, // Priority from CoreProblem points

    // Forgetting curve settings
    FORGETTING_RATE: 5.0,   // Points per day elapsed

    // Unlock thresholds
    UNLOCK_ANSWER_RATE,
    UNLOCK_CORRECT_RATE
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
        },
        include: {
            problem: {
                select: {
                    coreProblems: {
                        select: { id: true }
                    }
                }
            }
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
        // We assume isCleared in UserProblemState means "Correct at least once" or we check evaluation history.
        // The current UserProblemState has isCleared. Let's use that.
        const correctCount = cpProblemIds.filter(pid => problemStateMap.get(pid)?.isCleared).length;

        const { isPassed, answerRate, correctRate } = calculateCoreProblemStatus(totalProblems, answeredCount, correctCount);
        const isCleared = isPassed;

        coreProblemStats.set(cp.id, { answerRate, correctRate, isCleared });
    }

    // Determine unlocked status
    // CoreProblem 1 is always unlocked.
    // CoreProblem N is unlocked if CoreProblem N-1 is cleared.
    const unlockedCoreProblemIds = new Set<string>();

    // Sort coreProblems by order just to be safe (already sorted in query)
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
                // If previous not cleared, this one and subsequent ones are locked.
                // Exception: If we want to allow "skipping" if manually unlocked? 
                // Requirement says "アンロック形式...次のCoreProblemがアンロックされる". Implies strict chain.
                // But we also have `UserCoreProblemState.isUnlocked`. Should we respect that?
                // "CoreProblemには... userStates...".
                // If the user manually unlocked it (e.g. teacher override), we should respect it.
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
    // Fetch problems that belong to Unlocked CoreProblems.
    // "問題に複数のCoreProblemが含まれている場合、全てアンロックされているCoreProblemでないと、出題はされない。"

    // We need to fetch problems with their CoreProblems to check this condition.
    // We can fetch all problems for the subject again, or filter the ones we already know about?
    // We only have IDs from the first query. Let's fetch full problem details for candidate CoreProblems.

    // Optimization: Only fetch problems where at least one CoreProblem is unlocked, then filter in memory.
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
            // userStates removed - we use problemStateMap
        }
    });

    // Filter: ALL CoreProblems must be unlocked
    const validProblems = candidateProblems.filter(p => {
        return p.coreProblems.every(cp => unlockedCoreProblemIds.has(cp.id));
    });

    if (validProblems.length === 0) return [];

    // 4. Calculate Score
    const scoredProblems: ScoredProblem[] = validProblems.map(problem => {
        // Use map instead of problem.userStates[0]
        const state = problemStateMap.get(problem.id);
        let score = 0;
        let reason: 'forgetting' | 'weakness' | 'new' | 'priority' = 'new';

        // Base Score: CoreProblem Priorities
        // "CoreProblem+忘却曲線の合算ポイント"
        // "CoreProblem6,7のポイントが5上がる"
        // We need the UserCoreProblemState priority for each CP associated with this problem.
        // We need to fetch UserCoreProblemStates for all relevant CPs.
        // We loaded `userStates` in `coreProblems` query, let's map it.

        let cpPrioritySum = 0;
        for (const cp of problem.coreProblems) {
            // Find the CP in our initial list to get the userState
            const cpRef = coreProblems.find(c => c.id === cp.id);
            const cpState = cpRef?.userStates[0];
            if (cpState) {
                cpPrioritySum += cpState.priority;
            }
        }

        const priorityScore = cpPrioritySum * PRINT_CONFIG.WEIGHT_CORE_PRIORITY;
        score += priorityScore;

        if (!state) {
            // Unanswered
            score += 100 * PRINT_CONFIG.WEIGHT_UNANSWERED;
            score -= problem.order * 0.1; // Slight preference for order
            if (score > priorityScore) reason = 'new';
            else reason = 'priority';
        } else {
            // Answered
            const now = new Date();
            const lastAnswered = state.lastAnsweredAt || new Date(0);
            const diffMs = now.getTime() - lastAnswered.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            const timeScore = diffDays * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME;

            // Add priority from problem state (if any remaining logic uses it, though requirement emphasizes CP priority)
            // "CoreProblem+忘却曲線の合算ポイント" -> Doesn't mention individual problem weakness explicitly, 
            // but usually we want to review mistakes.
            // "CoreProblem6,7のポイントが5上がる" -> This handles the "mistake" feedback loop.
            // So maybe we don't need `state.priority`? 
            // But `UserProblemState` still has `priority`.
            // Let's include it as a minor factor or ignore if CP priority is the main driver.
            // Requirement: "CoreProblem+忘却曲線の合算ポイント"
            // Let's stick to that.

            score += timeScore;

            if (timeScore > priorityScore) reason = 'forgetting';
            else reason = 'priority';
        }

        return { problem, score, reason };
    });

    // 5. Sort by score descending
    scoredProblems.sort((a, b) => b.score - a.score);

    // 6. Select top 'count'
    return scoredProblems.slice(0, count).map(sp => sp.problem);
}
