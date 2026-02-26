import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionForMobile } from '@/lib/auth-mobile';
import { prisma } from '@/lib/prisma';

const bodySchema = z.object({
    sessionId: z.string().min(1),
    score: z.number().int().min(0),
    correctCount: z.number().int().min(0),
    totalCount: z.number().int().min(0),
    maxCombo: z.number().int().min(0),
    level: z.enum(['beginner', 'intermediate', 'advanced']),
    endedAt: z.string().datetime(),
});

const ALLOWED_ROLES = new Set(['STUDENT']);

export async function POST(request: NextRequest) {
    const session = await getSessionForMobile(request);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ALLOWED_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let rawBody: unknown;
    try {
        rawBody = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request body' }, { status: 400 });
    }

    const endedAt = new Date(parsed.data.endedAt);

    try {
        await prisma.vocabularyGameScore.upsert({
            where: {
                userId_sessionId: {
                    userId: session.userId,
                    sessionId: parsed.data.sessionId,
                },
            },
            create: {
                userId: session.userId,
                sessionId: parsed.data.sessionId,
                score: parsed.data.score,
                correctCount: parsed.data.correctCount,
                totalCount: parsed.data.totalCount,
                maxCombo: parsed.data.maxCombo,
                level: parsed.data.level,
                playedAt: endedAt,
            },
            update: {
                score: parsed.data.score,
                correctCount: parsed.data.correctCount,
                totalCount: parsed.data.totalCount,
                maxCombo: parsed.data.maxCombo,
                level: parsed.data.level,
                playedAt: endedAt,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[iOS Vocabulary Scores API] エラー:', error);
        return NextResponse.json({ error: 'スコアの保存に失敗しました' }, { status: 500 });
    }
}
