import { prisma } from '@/lib/prisma';

// Configuration for progression/unlock thresholds
export const UNLOCK_ANSWER_RATE = 0.5; // 50%
export const UNLOCK_CORRECT_RATE = 0.6; // 60%

export type CoreProblemStatus = {
    isPassed: boolean;
    answerRate: number;
    correctRate: number;
};

type CoreProblemLite = {
    id: string;
    order: number;
};

function sortCoreProblems<T extends CoreProblemLite>(coreProblems: T[]): T[] {
    return [...coreProblems].sort((a, b) => {
        if (a.order !== b.order) {
            return a.order - b.order;
        }
        return a.id.localeCompare(b.id);
    });
}

/**
 * 教科内の「最初のCoreProblem ID」を返す。
 * 同順位(order)がある場合はid昇順で先頭を採用する。
 */
export function getEntryCoreProblemId<T extends CoreProblemLite>(coreProblems: T[]): string | null {
    if (coreProblems.length === 0) return null;
    const sorted = sortCoreProblems(coreProblems);
    return sorted[0].id;
}

export function hasLectureVideos(lectureVideos: unknown): boolean {
    return Array.isArray(lectureVideos) && lectureVideos.length > 0;
}

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
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
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
    const entryCoreProblemId = getEntryCoreProblemId(coreProblems);
    if (entryCoreProblemId) {
        unlockedIds.add(entryCoreProblemId);
    }

    return unlockedIds;
}

/**
 * 「学習可能な」CoreProblem IDを取得する。
 * 条件: isUnlocked = true かつ (isLectureWatched = true または 講義動画がない)
 * 印刷出題時などに使用する。
 */
export async function getReadyCoreProblemIds(userId: string, subjectId: string): Promise<Set<string>> {
    // 1. Fetch all CoreProblems for the subject with lectureVideos info
    const coreProblems = await prisma.coreProblem.findMany({
        where: { subjectId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, order: true, lectureVideos: true }
    });

    if (coreProblems.length === 0) return new Set();

    // 2. Fetch User States (unlocked ones)
    const userStates = await prisma.userCoreProblemState.findMany({
        where: {
            userId,
            coreProblemId: { in: coreProblems.map(cp => cp.id) },
            isUnlocked: true
        },
        select: { coreProblemId: true, isLectureWatched: true }
    });

    const stateMap = new Map(userStates.map(s => [s.coreProblemId, s]));

    const readyIds = new Set<string>();
    const entryCoreProblemId = getEntryCoreProblemId(coreProblems);

    for (const cp of coreProblems) {
        const state = stateMap.get(cp.id);
        const hasVideos = hasLectureVideos(cp.lectureVideos);

        // 最初の単元は無条件でReady（仕様）
        if (entryCoreProblemId && cp.id === entryCoreProblemId) {
            readyIds.add(cp.id);
            continue;
        }

        // アンロック済みでない場合はスキップ
        if (!state) continue;

        // 講義動画がない場合、または視聴済みの場合はReady
        if (!hasVideos || state.isLectureWatched) {
            readyIds.add(cp.id);
        }
    }

    return readyIds;
}
