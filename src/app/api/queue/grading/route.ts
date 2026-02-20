
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

export const maxDuration = 300; // Allow up to 5 minutes for AI grading

function isWorkerRuntime() {
    return (process.env.SERVICE_ROLE || '').toLowerCase() === 'worker';
}

async function handler(req: NextRequest) {
    try {
        if (!isWorkerRuntime()) {
            console.error('[API] /api/queue/grading is disabled on non-worker service');
            return NextResponse.json({ error: 'Worker service only' }, { status: 503 });
        }

        const body = await req.json();
        const { fileId, fileName } = body;

        if (!fileId || !fileName) {
            return NextResponse.json({ error: 'Missing fileId or fileName' }, { status: 400 });
        }

        console.log(`[API] Received grading job for ${fileName} (${fileId})`);

        // Execute the processing (Long running)
        const { processFile } = await import('@/lib/grading-service');
        await processFile(fileId, fileName);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Grading Job Error:', error);
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
