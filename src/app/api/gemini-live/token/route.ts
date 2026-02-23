import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { issueGeminiLiveSessionToken } from '@/lib/gemini-live-session-token';
import { getStudentAccessContext } from '@/lib/authorization';
import { canUseAiTutor } from '@/lib/plan-entitlements';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(request: Request) {
    const session = await getCurrentUser();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let targetStudentId = '';
    try {
        const body = (await request.json()) as { targetStudentId?: unknown };
        targetStudentId = typeof body.targetStudentId === 'string' ? body.targetStudentId.trim() : '';
    } catch {
        targetStudentId = '';
    }

    if (!targetStudentId) {
        return NextResponse.json({ error: 'targetStudentId is required' }, { status: 400 });
    }

    const access = await getStudentAccessContext({
        actorUserId: session.userId,
        actorRole: session.role,
        targetStudentId,
    });

    if (!access.allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canUseAiTutor(access.student?.classroomPlan)) {
        return NextResponse.json({ error: 'AI tutor is not available for this classroom plan' }, { status: 403 });
    }

    try {
        const issued = issueGeminiLiveSessionToken(targetStudentId);
        return NextResponse.json({
            token: issued.token,
            expiresAt: issued.expiresAt,
            ttlSeconds: issued.ttlSeconds,
        });
    } catch (error) {
        console.error('[GeminiLiveToken] Failed to issue token:', error);
        return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 });
    }
}
