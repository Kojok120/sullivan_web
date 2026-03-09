import { NextRequest, NextResponse } from 'next/server';

import { isWorkerRuntime } from '@/lib/runtime-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    try {
        if (!isWorkerRuntime()) {
            console.error('[API] /api/queue/drive-check is disabled on non-worker service');
            return NextResponse.json({ error: 'Worker service only' }, { status: 503 });
        }

        const body = await req.json().catch(() => null);
        const source = typeof body?.source === 'string' ? body.source.trim() : 'next-route';
        const { secureDriveCheck } = await import('@/lib/grading-service');
        await secureDriveCheck(source);

        return NextResponse.json({ success: true, message: 'Drive check completed or skipped due to lock' });
    } catch (error) {
        console.error('[API] Queued Drive Check Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
