import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getReadyCoreProblemIds } from "@/lib/progression";
import { DEFAULT_PRINT_CONFIG, type PrintSelectionConfig } from "@/lib/print-config";
import type { PrintableProblem } from "@/lib/print-types";

export const PRINT_CONFIG = DEFAULT_PRINT_CONFIG;

type ScoredProblem = {
    problem: PrintableProblem;
    score: number;
    isUnanswered: boolean;
};

function requirePrintableCustomId(problem: { id: string; customId: string | null }): string {
    if (!problem.customId) {
        throw new Error(`印刷対象の問題 ${problem.id} に customId が設定されていません`);
    }

    return problem.customId;
}


export async function selectProblemsForPrint(
    userId: string,
    subjectId: string,
    coreProblemId?: string,
    count: number = 30,
    shuffleSeed?: string,
    config: PrintSelectionConfig = DEFAULT_PRINT_CONFIG
): Promise<PrintableProblem[]> {

    // 2. Fetch Candidate Problems with Integrated Filtering & User State
    // DB側で厳密にフィルタリングを行う

    const whereCondition: Prisma.ProblemWhereInput = {
        subjectId,
        status: 'PUBLISHED',
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

        // ready CoreProblem が 0 件の場合、印刷対象になり得る問題は存在しない。
        // Prisma の every は空配列で true になり、coreProblems を持たない異常データが
        // 紛れ込むと候補化されるため、ここで明示的に短絡する。
        if (readyCoreProblemIds.size === 0) {
            return [];
        }

        // 通常印刷（おまかせ）の場合:
        // 紐づく「全ての」CoreProblemがReadyでなければならない
        // （アンロック済み かつ 講義動画視聴済みまたは講義動画なし）
        // some + every で「coreProblems を最低1件持ち、かつ全てが ready」を担保する。
        whereCondition.coreProblems = {
            some: {},
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
            order: true,
            problemType: true,
            status: true,
            publishedRevisionId: true,
            publishedRevision: {
                select: {
                    structuredContent: true,
                    answerSpec: true,
                    printConfig: true,
                    assets: {
                        select: {
                            id: true,
                            kind: true,
                            fileName: true,
                            mimeType: true,
                            storageKey: true,
                            inlineContent: true,
                            width: true,
                            height: true,
                        },
                    },
                },
            },
            // UserProblemStateを一緒に取得 (1:N relation name is 'userStates')
            userStates: {
                where: { userId },
                select: { lastAnsweredAt: true, isCleared: true },
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
        const customId = requirePrintableCustomId(problem);
        // Integrated userState
        const state = problem.userStates[0];
        let score = 0;
        let isUnanswered = false;

        if (!state || !state.lastAnsweredAt) {
            // 未着手: ベーススコアを大きく取って既着手より優先する
            isUnanswered = true;
            score += config.UNANSWERED_BASE * config.WEIGHT_UNANSWERED;
            score -= problem.order * 0.1; // 順序を僅かに優先
        } else {
            // 既着手: 経過日数 → 上限クリップ
            const diffMs = now - state.lastAnsweredAt.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            const rawTimeScore = diffDays * config.FORGETTING_RATE * config.WEIGHT_TIME;
            score += Math.min(rawTimeScore, config.TIME_SCORE_CAP);

            if (state.isCleared) {
                // 正解済: 大きくスコアを下げて再演優先度を後ろに送る
                score -= config.CORRECT_PENALTY;
            } else {
                // 不正解: 弱点として加点
                score += config.WEAKNESS_BONUS * config.WEIGHT_WEAKNESS;
            }
        }

        return {
            problem: {
                id: problem.id,
                customId,
                order: problem.order,
                problemType: problem.problemType,
                status: problem.status,
                publishedRevisionId: problem.publishedRevisionId,
                structuredContent: problem.publishedRevision?.structuredContent as never,
                answerSpec: problem.publishedRevision?.answerSpec as never,
                printConfig: problem.publishedRevision?.printConfig as never,
                assets: problem.publishedRevision?.assets.map((asset) => ({
                    id: asset.id,
                    kind: asset.kind,
                    fileName: asset.fileName,
                    mimeType: asset.mimeType,
                    storageKey: asset.storageKey,
                    inlineContent: asset.inlineContent,
                    width: asset.width,
                    height: asset.height,
                })) ?? [],
            },
            score,
            isUnanswered,
        };
    });

    // 5. スコアで降順ソートし、同点はシードに基づいて決定論的にシャッフルする
    const random = createSeededRandom(
        shuffleSeed ?? `${userId}:${subjectId}:${coreProblemId ?? 'all'}`
    );
    const rankedProblems = shuffleTiedScores(scoredProblems, random);

    // 6. 印刷スロットを「未着手枠」と「既着手枠」に分けて確保する
    //    こうしないと未着手プールが多いとき復習が消え、少ないとき既着手で埋まってしまうので
    //    両者の最低出題数を担保する。
    const newQuota = Math.min(
        Math.max(config.NEW_QUOTA_MIN, Math.floor(count * config.NEW_QUOTA_RATIO)),
        count
    );
    const unansweredRanked = rankedProblems.filter(sp => sp.isUnanswered);
    const answeredRanked = rankedProblems.filter(sp => !sp.isUnanswered);

    const newSlots = unansweredRanked.slice(0, newQuota);
    const reviewSlots = answeredRanked.slice(0, count - newSlots.length);
    const overflowStart = newSlots.length;
    const overflowCount = count - newSlots.length - reviewSlots.length;
    const overflow = unansweredRanked.slice(overflowStart, overflowStart + overflowCount);

    return [...newSlots, ...reviewSlots, ...overflow]
        .slice(0, count)
        .map(sp => sp.problem);
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
