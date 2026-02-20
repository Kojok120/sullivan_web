
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { processFile } from '@/lib/grading-service';

export const maxDuration = 300; // Allow up to 5 minutes for AI grading


async function handler(req: NextRequest) {
    try {
        const body = await req.json();
        const { fileId, fileName } = body;

        if (!fileId || !fileName) {
            return NextResponse.json({ error: 'Missing fileId or fileName' }, { status: 400 });
        }

        console.log(`[API] Received grading job for ${fileName} (${fileId})`);

        // Execute the processing (Long running)
        await processFile(fileId, fileName);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Grading Job Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
export const POST = verifySignatureAppRouter(handler);
