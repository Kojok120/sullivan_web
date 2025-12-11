import { NextResponse } from 'next/server';
import { checkDriveForNewFiles } from '@/lib/grading-service';

export const dynamic = 'force-dynamic';

// Simple debounce mechanism using a global variable (serverless beware, but works for container/long-running)
let isProcessing = false;
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
            // Debounce
            const now = Date.now();
            if (isProcessing) {
                console.log("Webhook ignored (Processing in progress)");
                return NextResponse.json({ success: true, message: "Ignored (Busy)" });
            }
            if (now - lastTriggerTime < DEBOUNCE_MS) {
                console.log("Webhook ignored (Debounced)");
                return NextResponse.json({ success: true, message: "Ignored (Debounced)" });
            }

            // Trigger async processing (don't await fully to return 200 OK quickly to Google)
            // But Next.js Serverless functions might kill process if we return.
            // Safe bet is to await, but use the Lock mechanism inside checkDriveForNewFiles or api/grading/check
            // Actually, we can just call checkDriveForNewFiles directly.

            isProcessing = true;
            lastTriggerTime = now;

            // We wrap in a promise that we don't await strictly for the response, 
            // BUT for Vercel/Next.js lambda, we MUST await or use waitUntil.
            // Since this is likely a self-hosted node server (mac), proceeding async is okay, 
            // but let's await to be safe against process termination if deployed later.

            await checkDriveForNewFiles().catch(e => console.error("Webhook processing error:", e));

            isProcessing = false;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true, message: "Ignored state" });

    } catch (error) {
        console.error("Webhook Error:", error);
        isProcessing = false;
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
