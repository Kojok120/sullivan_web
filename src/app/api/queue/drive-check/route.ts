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
export const POST = verifySignatureAppRouter(handler);
