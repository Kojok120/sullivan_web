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
        const { coreProblemId } = await request.json();

        if (!coreProblemId) {
            return NextResponse.json({ error: 'coreProblemId is required' }, { status: 400 });
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
