import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds (max for Hobby) for fallback processing

export async function POST(request: Request) {
    try {
        const headers = request.headers;
        const channelId = headers.get('x-goog-channel-id');
        const channelToken = headers.get('x-goog-channel-token');
        const resourceState = headers.get('x-goog-resource-state');

        // セキュリティ: WebhookのチャンネルIDがRedisに保存されている有効な監視設定と一致するか確認
        const { getWatchState } = await import('@/lib/drive-watch-state');
        const activeState = await getWatchState();

        if (!activeState) {
            console.error('No active watch state found in Redis. Rejecting webhook.');
            return NextResponse.json({ error: 'No Active Watch' }, { status: 401 });
        }

        if (channelId !== activeState.channelId) {
            console.log(`Webhook rejected: Channel ID mismatch. Expected ${activeState.channelId}, got ${channelId}`);
            // メモ: 古い監視設定が通知を送信した場合に発生する可能性があります。無視して問題ありません。
            return NextResponse.json({ error: 'Unauthorized Channel' }, { status: 401 });
        }

        const expectedToken = activeState.token || process.env.DRIVE_WEBHOOK_TOKEN;
        if (expectedToken) {
            if (channelToken !== expectedToken) {
                console.log('Webhook rejected: Channel token mismatch.');
                return NextResponse.json({ error: 'Unauthorized Token' }, { status: 401 });
            }
        } else {
            console.warn('Drive webhook token is not configured; skipping token verification.');
        }

        console.log(`Webhook received. State: ${resourceState}, Channel: ${channelId}`);

        // 特定のステータスを処理
        if (resourceState === 'sync') {
            console.log("Webhook Sync event received.");
            return NextResponse.json({ success: true });
        }

        if (resourceState === 'change' || resourceState === 'update' || resourceState === 'add') {
            try {
                const { publishDriveCheckJob } = await import('@/lib/grading-job');
                await publishDriveCheckJob('webhook', resourceState, channelId);
            } catch (e) {
                console.error("QStashキューへの追加に失敗しました:", e);
                // キュー登録不可の場合は処理を継続せず、エラーで返して再送を促す
                return NextResponse.json({ success: false, error: 'Queue mechanism unavailable' }, { status: 503 });
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true, message: "Ignored state" });

    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
