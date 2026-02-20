// app/api/queue/drive-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { isWorkerRuntime } from '@/lib/runtime-utils';

export const maxDuration = 300; // Allow up to 5 minutes for processing

async function handler(req: NextRequest) {
    try {
        if (!isWorkerRuntime()) {
            console.error('[API] /api/queue/drive-check is disabled on non-worker service');
            return NextResponse.json({ error: 'Worker service only' }, { status: 503 });
        }

        console.log(`[API] Received queued drive check request. method=${req.method}`);

        // Call secureDriveCheck which safely acquires the lock and processes new files
        const { secureDriveCheck } = await import('@/lib/grading-service');
        await secureDriveCheck('webhook-qstash-queue');

        return NextResponse.json({ success: true, message: 'Drive check completed or skipped due to lock' });
    } catch (error) {
        console.error('[API] Queued Drive Check Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';

export const POST = async (req: NextRequest) => {
    // 実行時に環境変数をチェックすることで、ビルド時（環境変数がない状態）のエラーを回避
    if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
        console.error('[API] QStash signing keys are missing');
        return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
    }

    // 遅延してラッパーを生成
    const wrapped = verifySignatureAppRouter(handler);
    return wrapped(req);
};
