import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 講義動画視聴完了を記録
export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { coreProblemId, watchedDurationSeconds, videoDurationSeconds } = await request.json();

        if (!coreProblemId) {
            return NextResponse.json({ error: 'coreProblemId is required' }, { status: 400 });
        }

        const state = await prisma.userCoreProblemState.findUnique({
            where: {
                userId_coreProblemId: {
                    userId: session.userId,
                    coreProblemId,
                },
            },
            select: {
                isUnlocked: true,
            },
        });

        // ロック中・状態未作成の単元は no-op（視聴は許可するが進行状態は更新しない）
        if (!state || !state.isUnlocked) {
            return NextResponse.json({ success: true, updated: false });
        }

        // 視聴時間検証: 動画の60%以上を視聴していないと拒否
        if (videoDurationSeconds && videoDurationSeconds > 0 && watchedDurationSeconds !== undefined) {
            const ratio = watchedDurationSeconds / videoDurationSeconds;
            console.log(
                `[LectureWatched] User ${session.userId} CP ${coreProblemId}: watched ${watchedDurationSeconds}s / ${videoDurationSeconds}s (${Math.round(ratio * 100)}%)`
            );
            if (ratio < 0.6) {
                return NextResponse.json(
                    { error: '動画を十分に視聴してください（60%以上の視聴が必要です）' },
                    { status: 400 }
                );
            }
        }

        const updateResult = await prisma.userCoreProblemState.updateMany({
            where: {
                userId: session.userId,
                coreProblemId,
                isUnlocked: true,
            },
            data: {
                isLectureWatched: true,
                lectureWatchedAt: new Date(),
            },
        });

        if (updateResult.count === 0) {
            return NextResponse.json({ success: true, updated: false });
        }

        console.log(`[LectureWatched] User ${session.userId} marked CP ${coreProblemId} as watched`);

        return NextResponse.json({ success: true, updated: true });
    } catch (error) {
        console.error('Failed to mark lecture as watched:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}
