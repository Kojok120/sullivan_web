import { prisma } from '@/lib/prisma';
import {
    DEFAULT_PROGRESSION_RULES,
    UNLOCK_ANSWER_RATE,
    UNLOCK_CORRECT_RATE,
    type ProgressionRules,
} from '@sullivan/config';

// 進行判定（アンロック）しきい値は @sullivan/config 由来。
// 既存の @/lib/progression からの import を壊さないため再エクスポートする。
export { DEFAULT_PROGRESSION_RULES, UNLOCK_ANSWER_RATE, UNLOCK_CORRECT_RATE };
export type { ProgressionRules };

// CoreProblem 単位の進行状態
export type CoreProblemStatus = {
    isPassed: boolean;
    answerRate: number;
    correctRate: number;
};

type CoreProblemLite = {
    id: string;
    order: number;
};

type SubjectCoreProblemsLite = {
    subjectId: string;
    coreProblems: CoreProblemLite[];
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
 * CoreProblem の進行状態を計算する。
 *
 * @param totalProblems CoreProblem に含まれる総問題数
 * @param answeredCount 一度でも回答したユニーク問題数
 * @param correctCount 正答したユニーク問題数（isCleared=true）
 * @returns 進行判定に使う状態
 */
export function calculateCoreProblemStatus(
    totalProblems: number,
    answeredCount: number,
    correctCount: number,
    rules: ProgressionRules = DEFAULT_PROGRESSION_RULES
): CoreProblemStatus {
    if (totalProblems === 0) {
        return { isPassed: false, answerRate: 0, correctRate: 0 };
    }

    const answerRate = answeredCount / totalProblems;
    // 正解率は「正解したユニーク問題数 / 一度でも解いたユニーク問題数」
    // （総問題数では割らない）
    const correctRate = answeredCount > 0 ? correctCount / answeredCount : 0;

    const isPassed = answerRate >= rules.unlockAnswerRate && correctRate >= rules.unlockCorrectRate;

    return {
        isPassed,
        answerRate,
        correctRate
    };
}

/**
 * 複数教科分のアンロック済み CoreProblem ID を一括取得する。
 * 主に UserCoreProblemState.isUnlocked を参照しつつ、各教科の先頭 CoreProblem は常に含める。
 */
export async function getUnlockedCoreProblemIdsBySubject(
    userId: string,
    subjects: SubjectCoreProblemsLite[]
): Promise<Map<string, Set<string>>> {
    const unlockedBySubject = new Map<string, Set<string>>();
    if (subjects.length === 0) return unlockedBySubject;

    const allCoreProblemIds: string[] = [];
    for (const subject of subjects) {
        unlockedBySubject.set(subject.subjectId, new Set<string>());
        for (const coreProblem of subject.coreProblems) {
            allCoreProblemIds.push(coreProblem.id);
        }
    }

    if (allCoreProblemIds.length === 0) return unlockedBySubject;

    const userStates = await prisma.userCoreProblemState.findMany({
        where: {
            userId,
            coreProblemId: { in: allCoreProblemIds },
            isUnlocked: true
        },
        select: { coreProblemId: true }
    });
    const unlockedIds = new Set(userStates.map(s => s.coreProblemId));

    for (const subject of subjects) {
        const currentSet = unlockedBySubject.get(subject.subjectId) ?? new Set<string>();

        for (const coreProblem of subject.coreProblems) {
            if (unlockedIds.has(coreProblem.id)) {
                currentSet.add(coreProblem.id);
            }
        }

        // order が最小のものを先頭単元として常時アンロック
        const entryCoreProblemId = getEntryCoreProblemId(subject.coreProblems);
        if (entryCoreProblemId) {
            currentSet.add(entryCoreProblemId);
        }

        unlockedBySubject.set(subject.subjectId, currentSet);
    }

    return unlockedBySubject;
}

/**
 * 指定教科でアンロック済みの CoreProblem ID 集合を取得する。
 */
export async function getUnlockedCoreProblemIds(userId: string, subjectId: string): Promise<Set<string>> {
    const coreProblems = await prisma.coreProblem.findMany({
        where: { subjectId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, order: true }
    });

    if (coreProblems.length === 0) return new Set();

    const unlockedBySubject = await getUnlockedCoreProblemIdsBySubject(userId, [
        { subjectId, coreProblems },
    ]);

    return unlockedBySubject.get(subjectId) ?? new Set();
}

/**
 * 「学習可能な」CoreProblem IDを取得する。
 * 条件: isUnlocked = true かつ (isLectureWatched = true または 講義動画がない)
 * 印刷出題時などに使用する。
 */
export async function getReadyCoreProblemIds(userId: string, subjectId: string): Promise<Set<string>> {
    // 1. 対象教科の CoreProblem 一覧（講義動画情報付き）を取得
    const coreProblems = await prisma.coreProblem.findMany({
        where: { subjectId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, order: true, lectureVideos: true }
    });

    if (coreProblems.length === 0) return new Set();

    // 2. ユーザー状態（アンロック済み）を取得
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

        // 最初の単元は無条件で出題可能（仕様）
        if (entryCoreProblemId && cp.id === entryCoreProblemId) {
            readyIds.add(cp.id);
            continue;
        }

        // アンロック済みでない場合はスキップ
        if (!state) continue;

        // 講義動画がない場合、または視聴済みの場合は出題可能
        if (!hasVideos || state.isLectureWatched) {
            readyIds.add(cp.id);
        }
    }

    return readyIds;
}
