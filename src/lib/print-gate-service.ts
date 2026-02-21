import { prisma } from '@/lib/prisma';

type PrintGateServiceClient = Pick<typeof prisma, 'userCoreProblemState'>;

export type PrintGateResult = {
    blocked: boolean;
    coreProblemId?: string;
    coreProblemName?: string;
};

function hasLectureVideos(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
}

/**
 * 教科ごとの印刷可否を判定する。
 * アンロック済みかつ講義動画未視聴の単元がある場合は印刷をブロックする。
 */
export async function getPrintGate(
    userId: string,
    subjectId: string,
    client: PrintGateServiceClient = prisma
): Promise<PrintGateResult> {
    const states = await client.userCoreProblemState.findMany({
        where: {
            userId,
            isUnlocked: true,
            isLectureWatched: false,
            coreProblem: {
                subjectId,
            },
        },
        include: {
            coreProblem: {
                select: {
                    id: true,
                    name: true,
                    order: true,
                    lectureVideos: true,
                },
            },
        },
    });

    const pendingLectureStates = states
        .filter((state) => hasLectureVideos(state.coreProblem.lectureVideos))
        .sort((a, b) => {
            if (a.coreProblem.order !== b.coreProblem.order) {
                return a.coreProblem.order - b.coreProblem.order;
            }
            return a.coreProblem.id.localeCompare(b.coreProblem.id);
        });

    const nextState = pendingLectureStates[0];
    if (!nextState) {
        return { blocked: false };
    }

    return {
        blocked: true,
        coreProblemId: nextState.coreProblem.id,
        coreProblemName: nextState.coreProblem.name,
    };
}
