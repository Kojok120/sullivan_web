import { prisma } from '@/lib/prisma';

type CoreProblemEntryStateClient = Pick<typeof prisma, 'coreProblem' | 'userCoreProblemState'>;

type CoreProblemSeed = {
    id: string;
    subjectId: string;
};

export type EnsureInitialCoreProblemStatesResult = {
    targetCount: number;
    createdCount: number;
};

/**
 * 各教科の最初のCoreProblem IDを取得する（order昇順、同順位はid昇順）。
 */
export async function getEntryCoreProblemIds(
    client: CoreProblemEntryStateClient = prisma
): Promise<string[]> {
    const coreProblems = await client.coreProblem.findMany({
        select: {
            id: true,
            subjectId: true,
        },
        orderBy: [
            { subjectId: 'asc' },
            { order: 'asc' },
            { id: 'asc' },
        ],
    });

    const entryMap = new Map<string, CoreProblemSeed>();
    for (const coreProblem of coreProblems) {
        if (!entryMap.has(coreProblem.subjectId)) {
            entryMap.set(coreProblem.subjectId, coreProblem);
        }
    }

    return Array.from(entryMap.values()).map((cp) => cp.id);
}

/**
 * 新規ユーザーに対して、各教科の初回CoreProblem状態を作成する。
 * 既存レコードはskipDuplicatesで温存される。
 */
export async function ensureInitialCoreProblemStates(
    userId: string,
    client: CoreProblemEntryStateClient = prisma
): Promise<EnsureInitialCoreProblemStatesResult> {
    const entryCoreProblemIds = await getEntryCoreProblemIds(client);

    if (entryCoreProblemIds.length === 0) {
        return {
            targetCount: 0,
            createdCount: 0,
        };
    }

    const result = await client.userCoreProblemState.createMany({
        data: entryCoreProblemIds.map((coreProblemId) => ({
            userId,
            coreProblemId,
            isUnlocked: true,
            // 初回単元は無条件アンロックだが、印刷前に講義視聴を要求するため未視聴で開始する
            isLectureWatched: false,
            lectureWatchedAt: null,
        })),
        skipDuplicates: true,
    });

    return {
        targetCount: entryCoreProblemIds.length,
        createdCount: result.count,
    };
}
