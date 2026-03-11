import type { LectureVideo } from '@/lib/lecture-videos';
import { normalizeLectureVideos } from '@/lib/lecture-videos';
import { prisma } from '@/lib/prisma';

type PrintGateServiceClient = Pick<typeof prisma, 'userCoreProblemState'>;

export type PrintGateResult = {
    blocked: boolean;
    coreProblemId?: string;
    coreProblemName?: string;
    lectureVideos?: LectureVideo[];
};

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
        .map((state) => ({
            ...state,
            normalizedLectureVideos: normalizeLectureVideos(state.coreProblem.lectureVideos),
        }))
        .filter((state) => state.normalizedLectureVideos.length > 0)
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
        lectureVideos: nextState.normalizedLectureVideos,
    };
}
