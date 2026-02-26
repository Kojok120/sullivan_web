// iOS用: 目標データ取得API
// GET /api/ios/goals
// Authorization: Bearer <supabase_jwt>

import { NextRequest, NextResponse } from 'next/server';
import { getSessionForMobile } from '@/lib/auth-mobile';
import { getGoalDailyViewPayload } from '@/lib/student-goal-service';

const ALLOWED_ROLES = new Set(['STUDENT']);

export async function GET(request: NextRequest) {
    const session = await getSessionForMobile(request);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ALLOWED_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const timeZone = request.nextUrl.searchParams.get('timeZone') || 'Asia/Tokyo';

        const payload = await getGoalDailyViewPayload({
            studentId: session.userId,
            timeZone,
        });

        return NextResponse.json(payload);
    } catch (error) {
        console.error('[iOS Goals API] エラー:', error);
        return NextResponse.json(
            { error: '目標データの取得に失敗しました' },
            { status: 500 }
        );
    }
}
