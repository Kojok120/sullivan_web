
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

// QStash署名検証を有効化（ビルド時にはenv varsがないため条件付き）
// QSTASH_CURRENT_SIGNING_KEY と QSTASH_NEXT_SIGNING_KEY が必要
const hasQStashKeys = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY;

export const POST = hasQStashKeys
    ? verifySignatureAppRouter(handler)
    : async (req: NextRequest) => {
        // Fallback protection (Fail-Closed)
        const authHeader = req.headers.get('Authorization');
        if (!process.env.INTERNAL_API_SECRET || authHeader !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized (QStash keys missing & no Secret)' }, { status: 401 });
        }
        return handler(req);
    };
