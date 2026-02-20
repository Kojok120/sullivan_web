// app/api/queue/drive-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { secureDriveCheck } from '@/lib/grading-service';

export const maxDuration = 300; // Allow up to 5 minutes for processing

async function handler(req: NextRequest) {
    try {
        console.log(`[API] Received queued drive check request.`);

        // Call secureDriveCheck which safely acquires the lock and processes new files
        await secureDriveCheck('webhook-qstash-queue');

        return NextResponse.json({ success: true, message: 'Drive check completed or skipped due to lock' });
    } catch (error) {
        console.error('[API] Queued Drive Check Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';

export const POST = async (req: NextRequest, ...args: any[]) => {
    // 実行時に環境変数をチェックすることで、ビルド時（環境変数がない状態）のエラーを回避
    if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
        console.error('[API] QStash signing keys are missing');
        return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
    }

    // 遅延してラッパーを生成
    const wrapped = verifySignatureAppRouter(handler);
    return wrapped(req as any, ...args as any[]);
};
