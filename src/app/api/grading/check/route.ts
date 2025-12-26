import { NextRequest, NextResponse } from 'next/server';
import { checkDriveForNewFiles } from '@/lib/grading-service';
import { acquireGradingLock, releaseGradingLock } from '@/lib/grading-lock';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // SECURITY: Require internal API secret for this endpoint
    const authHeader = request.headers.get('Authorization');
    const expectedSecret = process.env.INTERNAL_API_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Try to acquire lock using shared mechanism
        const lockAcquired = await acquireGradingLock();
        if (!lockAcquired) {
            console.log('Grading check skipped: Lock is active.');
            return NextResponse.json({ success: false, message: 'Processing in progress' }, { status: 429 });
        }

        try {
            console.log('Triggering drive check...');
            await checkDriveForNewFiles();
            return NextResponse.json({ success: true, message: 'Drive check completed' });
        } finally {
            // Release lock
            await releaseGradingLock();
        }
    } catch (error) {
        console.error('Drive check failed:', error);
        // Ensure lock is released even on error
        await releaseGradingLock();
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

