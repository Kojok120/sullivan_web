import { NextResponse } from 'next/server';
import { Client as QStashClient } from '@upstash/qstash';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds (max for Hobby) for fallback processing

export async function POST(request: Request) {
    try {
        const headers = request.headers;
        const channelId = headers.get('x-goog-channel-id');
        const channelToken = headers.get('x-goog-channel-token');
        const resourceState = headers.get('x-goog-resource-state');

        // SECURITY: Verify webhook channel ID matches the active watch stored in Redis
        const { getWatchState } = await import('@/lib/drive-watch-state');
        const activeState = await getWatchState();

        if (!activeState) {
            console.error('No active watch state found in Redis. Rejecting webhook.');
            return NextResponse.json({ error: 'No Active Watch' }, { status: 401 });
        }

        if (channelId !== activeState.channelId) {
            console.log(`Webhook rejected: Channel ID mismatch. Expected ${activeState.channelId}, got ${channelId}`);
            // Note: This might happen if an old watch sends a notification. We should ignore it.
            return NextResponse.json({ error: 'Unauthorized Channel' }, { status: 401 });
        }

        const expectedToken = activeState.token || process.env.DRIVE_WEBHOOK_TOKEN;
        if (expectedToken) {
            if (channelToken !== expectedToken) {
                console.log('Webhook rejected: Channel token mismatch.');
                return NextResponse.json({ error: 'Unauthorized Token' }, { status: 401 });
            }
        } else {
            console.warn('Drive webhook token is not configured; skipping token verification.');
        }

        console.log(`Webhook received. State: ${resourceState}, Channel: ${channelId}`);

        // Handle specific states
        if (resourceState === 'sync') {
            console.log("Webhook Sync event received.");
            return NextResponse.json({ success: true });
        }

        if (resourceState === 'change' || resourceState === 'update' || resourceState === 'add') {
            const token = process.env.QSTASH_TOKEN;
            const appUrl = process.env.GRADING_WORKER_URL || process.env.APP_URL;

            if (token && appUrl) {
                const client = new QStashClient({ token });
                const baseUrl = appUrl.replace(/\/+$/, '');
                try {
                    await client.publishJSON({
                        url: `${baseUrl}/api/queue/drive-check`,
                        body: { source: 'webhook', state: resourceState, channelId },
                        delay: "5s", // Wait 5 seconds for Drive API consistency
                        retries: 3,
                    });
                    console.log(`Queued drive check via QStash`);
                } catch (e) {
                    console.error("Failed to queue drive check to QStash:", e);
                    // Fallback to async check
                    const { secureDriveCheck } = await import('@/lib/grading-service');
                    secureDriveCheck('webhook-fallback-queue').catch(console.error);
                }
            } else {
                console.warn("QStash config missing. Executing drive check synchronously (fallback).");
                const { secureDriveCheck } = await import('@/lib/grading-service');
                // Wait locally instead of QStash delay
                setTimeout(() => {
                    secureDriveCheck('webhook-fallback-sync').catch(console.error);
                }, 5000);
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true, message: "Ignored state" });

    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
