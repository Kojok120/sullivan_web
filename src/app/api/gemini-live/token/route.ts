import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { issueGeminiLiveSessionToken } from '@/lib/gemini-live-session-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;
const ALLOWED_ROLES = new Set(['STUDENT', 'TEACHER', 'PARENT', 'ADMIN']);

export async function POST() {
    const session = await getCurrentUser();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ALLOWED_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const issued = issueGeminiLiveSessionToken(session.userId);
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
