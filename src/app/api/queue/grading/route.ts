import { NextRequest, NextResponse } from 'next/server';

import { isWorkerRuntime } from '@/lib/runtime-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    try {
        if (!isWorkerRuntime()) {
            console.error('[API] /api/queue/grading is disabled on non-worker service');
            return NextResponse.json({ error: 'Worker service only' }, { status: 503 });
        }

        const body = await req.json();
        const fileId = typeof body?.fileId === 'string' ? body.fileId.trim() : '';
        const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';

        if (!fileId || !fileName) {
            return NextResponse.json({ error: 'Missing fileId or fileName' }, { status: 400 });
        }

        const { processFile } = await import('@/lib/grading-service');
        await processFile(fileId, fileName);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Grading Job Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
