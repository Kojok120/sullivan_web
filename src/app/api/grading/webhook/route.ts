import { NextResponse } from 'next/server';
import { checkDriveForNewFiles } from '@/lib/grading-service';
import { acquireGradingLock, releaseGradingLock } from '@/lib/grading-lock';

export const dynamic = 'force-dynamic';

// Debounce timing (still needed to throttle rapid webhook calls)
let lastTriggerTime = 0;
const DEBOUNCE_MS = 5000; // Ignore rapid-fire webhooks within 5 seconds

export async function POST(request: Request) {
    try {
        const headers = request.headers;
        const channelId = headers.get('x-goog-channel-id');
        const resourceId = headers.get('x-goog-resource-id');
        const resourceState = headers.get('x-goog-resource-state');

        console.log(`Webhook received. State: ${resourceState}, Channel: ${channelId}`);

        // Handle specific states
        if (resourceState === 'sync') {
            console.log("Webhook Sync event received.");
            return NextResponse.json({ success: true });
        }

        if (resourceState === 'change' || resourceState === 'update' || resourceState === 'add') {
            // Debounce rapid calls
            const now = Date.now();
            if (now - lastTriggerTime < DEBOUNCE_MS) {
                console.log("Webhook ignored (Debounced)");
                return NextResponse.json({ success: true, message: "Ignored (Debounced)" });
            }

            // Try to acquire shared lock
            const lockAcquired = await acquireGradingLock();
            if (!lockAcquired) {
                console.log("Webhook ignored (Lock active)");
                return NextResponse.json({ success: true, message: "Ignored (Busy)" });
            }

            lastTriggerTime = now;

            try {
                await checkDriveForNewFiles();
            } catch (e) {
                console.error("Webhook processing error:", e);
            } finally {
                await releaseGradingLock();
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true, message: "Ignored state" });

    } catch (error) {
        console.error("Webhook Error:", error);
        await releaseGradingLock();
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

