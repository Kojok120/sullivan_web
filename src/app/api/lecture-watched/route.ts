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

        // 視聴時間検証: 動画の60%以上を視聴していないと拒否
        if (videoDurationSeconds && videoDurationSeconds > 0 && watchedDurationSeconds !== undefined) {
            const ratio = watchedDurationSeconds / videoDurationSeconds;
            console.log(`[LectureWatched] User ${session.userId} CP ${coreProblemId}: watched ${watchedDurationSeconds}s / ${videoDurationSeconds}s (${Math.round(ratio * 100)}%)`);
            if (ratio < 0.6) {
                return NextResponse.json(
                    { error: '動画を十分に視聴してください（60%以上の視聴が必要です）' },
                    { status: 400 }
                );
            }
        }

        // UserCoreProblemStateを更新（存在しない場合は作成）
        await prisma.userCoreProblemState.upsert({
            where: {
                userId_coreProblemId: {
                    userId: session.userId,
                    coreProblemId
                }
            },
            create: {
                userId: session.userId,
                coreProblemId,
                isUnlocked: true,
                isLectureWatched: true,
                lectureWatchedAt: new Date()
            },
            update: {
                isLectureWatched: true,
                lectureWatchedAt: new Date()
            }
        });

        console.log(`[LectureWatched] User ${session.userId} marked CP ${coreProblemId} as watched`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to mark lecture as watched:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}
