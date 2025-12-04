import { prisma } from "@/lib/prisma";
import { Problem, UserProblemState } from "@prisma/client";

// Configuration for the print algorithm
const PRINT_CONFIG = {
    // Weights for scoring
    WEIGHT_TIME: 2.0,       // Priority for forgetting (time elapsed)
    WEIGHT_WEAKNESS: 1.0,   // Priority for weakness (low accuracy/evaluation)
    WEIGHT_UNANSWERED: 1.5, // Priority for new/unanswered problems

    // Forgetting curve settings
    FORGETTING_RATE: 5.0,   // Points per day elapsed

    // Evaluation adjustments (lower evaluation = higher priority to review)
    EVAL_ADJUSTMENT: {
        "A": -30,
        "B": -10,
        "C": 10,
        "D": 30,
        "NONE": 0 // For unanswered
    }
};

type ScoredProblem = {
    problem: Problem;
    score: number;
    reason: 'forgetting' | 'weakness' | 'new';
};

export async function selectProblemsForPrint(
    userId: string,
    subjectId: string,
    count: number = 40 // Fetch enough to fill pages dynamically
): Promise<Problem[]> {
    // 1. Fetch all problems for the subject
    // We need to fetch via Units -> CoreProblems -> Problems
    const problems = await prisma.problem.findMany({
        where: {
            coreProblem: {
                unit: {
                    subjectId: subjectId
                }
            }
        },
        include: {
            coreProblem: {
                include: {
                    unit: true
                }
            }
        }
    });

    if (problems.length === 0) return [];

    // 2. Fetch user states for these problems
    const userStates = await prisma.userProblemState.findMany({
        where: {
            userId: userId,
            problemId: { in: problems.map(p => p.id) }
        }
    });

    const stateMap = new Map(userStates.map(s => [s.problemId, s]));

    // 3. Calculate score for each problem
    const scoredProblems: ScoredProblem[] = problems.map(problem => {
        const state = stateMap.get(problem.id);
        let score = 0;
        let reason: 'forgetting' | 'weakness' | 'new' = 'new';

        if (!state) {
            // Unanswered problem
            // Use order to prioritize earlier problems if they are all new? 
            // Or just treat them as high priority to introduce new content.
            // Let's give a base score plus a small bonus for lower order (earlier in curriculum)
            score = 100 * PRINT_CONFIG.WEIGHT_UNANSWERED;
            // Subtract order to prioritize earlier problems slightly
            score -= problem.order * 0.1;
            reason = 'new';
        } else {
            // Answered problem
            const now = new Date();
            const lastAnswered = state.lastAnsweredAt || new Date(0); // Should have date if state exists
            const diffMs = now.getTime() - lastAnswered.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            // Time Score (Forgetting)
            const timeScore = diffDays * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME;

            // Weakness Score (Priority from DB which reflects evaluation)
            // Higher priority in DB means "needs review". 
            // We can use the stored priority directly or recalculate based on evaluation history if we wanted.
            // Let's use the stored priority as it accumulates adjustments.
            const weaknessScore = state.priority * PRINT_CONFIG.WEIGHT_WEAKNESS;

            score = timeScore + weaknessScore;

            if (timeScore > weaknessScore) {
                reason = 'forgetting';
            } else {
                reason = 'weakness';
            }
        }

        return { problem, score, reason };
    });

    // 4. Sort by score descending
    scoredProblems.sort((a, b) => b.score - a.score);

    // 5. Select top 'count' problems
    // We might want to ensure some variety (interleaving) here, 
    // but the scoring naturally mixes things if the user has been learning linearly.
    // High priority old items will mix with high priority weak items.

    // Let's just take the top N for now.
    const selected = scoredProblems.slice(0, count).map(sp => sp.problem);

    // 6. Sort selected problems for display?
    // Usually for a test/print, we might want them ordered by Unit/Order to make it flow logically,
    // OR mixed up for "Interleaving" effect.
    // The requirement says "Interleaving (mixed learning) is better".
    // So we keep the random-ish order from the score sort, or explicitly shuffle?
    // The score sort groups "most urgent" together. 
    // Let's sort them by Unit/Order for the final output so it's not completely chaotic for the student to read?
    // Actually, interleaving means NOT blocked by unit. 
    // So keeping them in score order (mixed units) is good, or shuffling them.
    // Let's sort by score (urgency) so the most important ones are definitely on the first page.

    return selected;
}
