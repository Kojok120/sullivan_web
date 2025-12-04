import { Problem, UserProblemState } from "@prisma/client";
import { PriorityConfig, DEFAULT_CONFIG } from "./priority-config";

export type Evaluation = "A" | "B" | "C" | "D";

/**
 * Calculates the new base priority based on the evaluation.
 * This is used when updating the database after a user answers.
 */
export function calculateNewPriority(
    currentPriority: number,
    evaluation: Evaluation
): number {
    let adjustment = 0;
    switch (evaluation) {
        case "A":
            adjustment = DEFAULT_CONFIG.priorityAdjustmentA;
            break;
        case "B":
            adjustment = DEFAULT_CONFIG.priorityAdjustmentB;
            break;
        case "C":
            adjustment = DEFAULT_CONFIG.priorityAdjustmentC;
            break;
        case "D":
            adjustment = DEFAULT_CONFIG.priorityAdjustmentD;
            break;
    }
    return currentPriority + adjustment;
}

/**
 * Calculates the effective priority including time elapsed.
 * This is used when selecting the next problem to show.
 */
export function calculateEffectivePriority(
    basePriority: number,
    lastAnsweredAt: Date | null
): number {
    let timeAdjustment = 0;
    if (lastAnsweredAt) {
        const now = new Date();
        const diffMs = now.getTime() - lastAnsweredAt.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        // Forgetting curve: +rate priority per day
        timeAdjustment = Math.floor(diffDays * DEFAULT_CONFIG.forgettingCurveRate);
    }
    return basePriority + timeAdjustment;
}

/**
 * Deprecated: Use calculateNewPriority or calculateEffectivePriority instead.
 */
export function calculateNextPriority(
    currentPriority: number,
    evaluation: Evaluation,
    lastAnsweredAt: Date | null
): number {
    const base = calculateNewPriority(currentPriority, evaluation);
    return calculateEffectivePriority(base, lastAnsweredAt);
}

/**
 * Logic to select the next problem.
 * 
 * 1. Chain order (if new/unanswered in chain)
 * 2. Unanswered others
 * 3. Highest priority
 */
export function selectNextProblem(
    problems: Problem[],
    userStates: UserProblemState[]
): Problem | null {
    if (problems.length === 0) return null;

    // Create a map for quick lookup
    const stateMap = new Map(userStates.map((s) => [s.problemId, s]));

    // 1. Unanswered problems first (Chain Order)
    // Sort problems by chain order to find the first unanswered one
    const sortedProblems = [...problems].sort((a, b) => a.order - b.order);

    for (const problem of sortedProblems) {
        if (!stateMap.has(problem.id)) {
            return problem;
        }
    }

    // 2. Highest Priority (Review)
    // If all have been answered at least once, pick the one with the highest priority
    let selectedProblem: Problem | null = null;
    let maxPriority = -Infinity;

    for (const problem of problems) {
        const state = stateMap.get(problem.id);
        if (state) {
            // Calculate dynamic priority including time
            const effectivePriority = calculateEffectivePriority(state.priority, state.lastAnsweredAt);

            if (effectivePriority > maxPriority) {
                maxPriority = effectivePriority;
                selectedProblem = problem;
            }
        }
    }

    return selectedProblem;
}
