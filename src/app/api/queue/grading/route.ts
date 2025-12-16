
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { processFile } from '@/lib/grading-service';

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

// QStash署名検証を有効化
// QSTASH_CURRENT_SIGNING_KEY と QSTASH_NEXT_SIGNING_KEY が必要
export const POST = verifySignatureAppRouter(handler);
