import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getReadyCoreProblemIds } from "@/lib/progression";
import type { PrintableProblem } from "@/lib/print-types";

export const PRINT_CONFIG = {
    // Weights for scoring
    WEIGHT_TIME: 2.0,       // Priority for forgetting (time elapsed)
    WEIGHT_WEAKNESS: 1.0,   // Priority for weakness (low accuracy/evaluation)
    WEIGHT_UNANSWERED: 1.5, // Priority for new/unanswered problems

    // Forgetting curve settings
    FORGETTING_RATE: 5.0,   // Points per day elapsed
};

type ScoredProblem = {
    problem: PrintableProblem;
    score: number;
};


export async function selectProblemsForPrint(
    userId: string,
    subjectId: string,
    coreProblemId?: string,
    count: number = 30,
    shuffleSeed?: string
): Promise<PrintableProblem[]> {

    // 2. Fetch Candidate Problems with Integrated Filtering & User State
    // DB側で厳密にフィルタリングを行う

    const whereCondition: Prisma.ProblemWhereInput = {
        subjectId,
    };

    if (coreProblemId) {
        // 特定のUnitが指定された場合:
        // そのUnitに属する問題を抽出 (他のUnitがロックされていても関係ないという要件であればこれ)
        whereCondition.coreProblems = {
            some: { id: coreProblemId }
        };
    } else {
        // 1. Determine Ready CoreProblems (unlocked + lecture watched)
        // Unified Logic via progression.ts
        const readyCoreProblemIds = await getReadyCoreProblemIds(userId, subjectId);

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
        select: {
            id: true,
            customId: true,
            question: true,
            order: true,
            // UserProblemStateを一緒に取得 (1:N relation name is 'userStates')
            userStates: {
                where: { userId },
                select: { lastAnsweredAt: true },
                take: 1,
            },
        }
    });

    // 3. (Removed) JS Filter logic is no longer needed as DB handles it.
    // However, if strict consistency is needed regarding "must have at least one core problem", we could check here.
    // Assuming DB constraint ensures problem has coreProblems or logic allows orphans.

    if (candidateProblems.length === 0) return [];

    // 4. Calculate Score
    const now = Date.now();
    const scoredProblems: ScoredProblem[] = candidateProblems.map(problem => {
        // Integrated userState
        const state = problem.userStates[0];
        let score = 0;

        if (!state) {
            // Unanswered
            score += 100 * PRINT_CONFIG.WEIGHT_UNANSWERED;
            score -= problem.order * 0.1; // Slight preference for order
        } else {
            // Answered
            const lastAnswered = state.lastAnsweredAt || new Date(0);
            const diffMs = now - lastAnswered.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            const timeScore = diffDays * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME;
            score += timeScore;
        }

        return {
            problem: {
                id: problem.id,
                customId: problem.customId,
                question: problem.question,
                order: problem.order,
            },
            score,
        };
    });

    // 5. スコアで降順ソートし、同点はシードに基づいて決定論的にシャッフルする
    const random = createSeededRandom(
        shuffleSeed ?? `${userId}:${subjectId}:${coreProblemId ?? 'all'}`
    );
    const rankedProblems = shuffleTiedScores(scoredProblems, random);

    // 6. 上位 `count` 件を返す
    return rankedProblems.slice(0, count).map(sp => sp.problem);
}

function shuffleTiedScores(items: ScoredProblem[], random: () => number): ScoredProblem[] {
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const ranked: ScoredProblem[] = [];

    for (let index = 0; index < sorted.length;) {
        const score = sorted[index]?.score;
        const group: ScoredProblem[] = [];

        while (index < sorted.length && sorted[index]?.score === score) {
            const item = sorted[index];
            if (item) {
                group.push(item);
            }
            index += 1;
        }

        shuffleInPlace(group, random);
        ranked.push(...group);
    }

    return ranked;
}

function shuffleInPlace<T>(items: T[], random: () => number) {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
}

function createSeededRandom(seed: string): () => number {
    return mulberry32(hashSeed(seed));
}

function hashSeed(seed: string): number {
    let hash = 2166136261;

    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function mulberry32(seed: number): () => number {
    return () => {
        let next = (seed += 0x6D2B79F5);
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}
