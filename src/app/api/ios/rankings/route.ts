import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionForMobile } from '@/lib/auth-mobile';
import { getClassroomRankingPayload, RankingServiceError } from '@/lib/classroom-ranking-service';

const querySchema = z.object({
    timeZone: z.string().optional(),
});

const ALLOWED_ROLES = new Set(['STUDENT']);

export async function GET(request: NextRequest) {
    const session = await getSessionForMobile(request);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ALLOWED_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = querySchema.safeParse({
        timeZone: request.nextUrl.searchParams.get('timeZone') ?? undefined,
    });

    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    try {
        const payload = await getClassroomRankingPayload({
            actorUserId: session.userId,
            actorRole: session.role,
            timeZone: parsed.data.timeZone,
        });

        return NextResponse.json(payload);
    } catch (error) {
        if (error instanceof RankingServiceError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }

        console.error('[iOS Rankings API] エラー:', error);
        return NextResponse.json({ error: 'ランキングの取得に失敗しました' }, { status: 500 });
    }
}
