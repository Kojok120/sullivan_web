import { prisma } from "@/lib/prisma";
import { Problem, Prisma } from "@prisma/client";
import { getReadyCoreProblemIds } from "@/lib/progression";

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
};


export async function selectProblemsForPrint(
    userId: string,
    subjectId: string,
    coreProblemId?: string,
    count: number = 30
): Promise<Problem[]> {

    // 1. Determine Ready CoreProblems (unlocked + lecture watched)
    // Unified Logic via progression.ts
    const readyCoreProblemIds = await getReadyCoreProblemIds(userId, subjectId);

    // 2. Fetch Candidate Problems with Integrated Filtering & User State
    // DB側で厳密にフィルタリングを行う

    const whereCondition: Prisma.ProblemWhereInput = {};

    if (coreProblemId) {
        // 特定のUnitが指定された場合:
        // そのUnitに属する問題を抽出 (他のUnitがロックされていても関係ないという要件であればこれ)
        whereCondition.coreProblems = {
            some: { id: coreProblemId }
        };
    } else {
        // 通常印刷（おまかせ）の場合:
        // 紐づく「全ての」CoreProblemがReadyでなければならない
        // （アンロック済み かつ 講義動画視聴済みまたは講義動画なし）

        // Prismaの every は「空配列の場合もtrue」になる仕様があるが、
        // CoreProblemを持たない問題は存在しない前提（データ整合性）。

        whereCondition.coreProblems = {
            every: {
                id: { in: Array.from(readyCoreProblemIds) }
            },
        };
    }

    const candidateProblems = await prisma.problem.findMany({
        where: whereCondition,
        include: {
            coreProblems: {
                include: { userStates: { where: { userId } } }
            },
            // UserProblemStateを一緒に取得 (1:N relation name is 'userStates')
            userStates: {
                where: { userId },
                take: 1
            }
        }
    });

    // 3. (Removed) JS Filter logic is no longer needed as DB handles it.
    // However, if strict consistency is needed regarding "must have at least one core problem", we could check here.
    // Assuming DB constraint ensures problem has coreProblems or logic allows orphans.

    if (candidateProblems.length === 0) return [];

    // 4. Calculate Score
    const scoredProblems: ScoredProblem[] = candidateProblems.map(problem => {
        // Integrated userState
        const state = problem.userStates[0];
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

        return { problem, score };
    });

    // 5. Sort by score descending
    scoredProblems.sort((a, b) => b.score - a.score);

    // 6. Select top 'count'
    return scoredProblems.slice(0, count).map(sp => sp.problem);
}
