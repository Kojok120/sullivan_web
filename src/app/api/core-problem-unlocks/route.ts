import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 未読のCoreProblemアンロック通知を取得
export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json([], { status: 401 });
    }

    try {
        // 未読のcore_problem_unlockedイベントを取得
        const events = await prisma.realtimeEvent.findMany({
            where: {
                userId: session.userId,
                type: 'core_problem_unlocked'
            },
            orderBy: { createdAt: 'asc' },
            take: 10 // 最大10件
        });

        // イベント情報を整形して返す
        const unlocks = events.map(event => ({
            eventId: event.id,
            ...(event.payload as any || {})
        }));

        return NextResponse.json(unlocks);
    } catch (error) {
        console.error('Failed to fetch core problem unlocks:', error);
        return NextResponse.json([], { status: 500 });
    }
}

// CoreProblemアンロック通知を既読にする
export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { eventId } = await request.json();

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
        }

        // イベントを削除（既読として扱う）
        await prisma.realtimeEvent.delete({
            where: {
                id: eventId,
                userId: session.userId // セキュリティ: 自分のイベントのみ削除可能
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to mark unlock as seen:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}
