import { NextRequest, NextResponse } from 'next/server';
import { acquireGradingLock, releaseGradingLock } from '@/lib/grading-lock';
import { isWorkerRuntime } from '@/lib/runtime-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for fallback processing

export async function GET(request: NextRequest) {
    if (!isWorkerRuntime()) {
        console.error('[API] /api/grading/check is disabled on non-worker service');
        return NextResponse.json({ error: 'Worker service only' }, { status: 503 });
    }

    // SECURITY: Require internal API secret for this endpoint
    const authHeader = request.headers.get('Authorization');
    const expectedSecret = process.env.INTERNAL_API_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let lockAcquired = false;
    try {
        // Try to acquire lock using shared mechanism
        lockAcquired = await acquireGradingLock();
        if (!lockAcquired) {
            console.log('Grading check skipped: Lock is active.');
            return NextResponse.json({ success: false, message: 'Processing in progress' }, { status: 429 });
        }

        console.log('Triggering drive check...');
        const { checkDriveForNewFiles } = await import('@/lib/grading-service');
        await checkDriveForNewFiles();
        return NextResponse.json({ success: true, message: 'Drive check completed' });
    } catch (error) {
        console.error('Drive check failed:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    } finally {
        if (lockAcquired) {
            await releaseGradingLock();
        }
    }
}
