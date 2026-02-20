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

// Enable QStash signature verification
const hasQStashKeys = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY;

export const POST = hasQStashKeys
    ? verifySignatureAppRouter(handler)
    : async (req: NextRequest) => {
        // Fallback protection (Fail-Closed) if keys are missing
        const authHeader = req.headers.get('Authorization');
        if (!process.env.INTERNAL_API_SECRET || authHeader !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized (QStash keys missing & no Secret)' }, { status: 401 });
        }
        return handler(req);
    };
