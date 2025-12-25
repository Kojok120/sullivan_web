import { NextResponse } from 'next/server';
import { watchDriveFolder, stopWatching } from '@/lib/drive-webhook-manager';
import { saveWatchState, getWatchState, clearWatchState } from '@/lib/drive-watch-state';

export const dynamic = 'force-dynamic';

// Renew watch if it expires within this time (6 hours before expiration)
const RENEW_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * POST /api/drive/watch/renew
 * Called by Cloud Scheduler every 12 hours to renew the Drive watch.
 * Google Drive watches expire after ~24 hours, so we renew proactively.
 */
export async function POST() {
    try {
        const appUrl = process.env.APP_URL;
        if (!appUrl) {
            return NextResponse.json(
                { success: false, error: 'APP_URL is not configured' },
                { status: 500 }
            );
        }

        const webhookUrl = `${appUrl}/api/grading/webhook`;
        const currentState = await getWatchState();

        // Check if renewal is needed
        if (currentState) {
            const timeUntilExpiry = currentState.expiration - Date.now();

            if (timeUntilExpiry > RENEW_THRESHOLD_MS) {
                const hoursRemaining = Math.round(timeUntilExpiry / 1000 / 60 / 60);
                console.log(`Watch still valid for ${hoursRemaining} hours. Skipping renewal.`);
                return NextResponse.json({
                    success: true,
                    action: 'skipped',
                    message: `Watch still valid for ${hoursRemaining} hours`,
                    expiresAt: new Date(currentState.expiration).toISOString(),
                });
            }

            // Stop the old watch (best effort, don't fail if this fails)
            try {
                console.log(`Stopping old watch channel: ${currentState.channelId}`);
                await stopWatching(currentState.channelId, currentState.resourceId);
            } catch (stopError) {
                console.warn('Failed to stop old watch (continuing anyway):', stopError);
            }
        }

        // Register new watch
        console.log('Registering new Drive watch...');
        const result = await watchDriveFolder(webhookUrl);

        // Save new state
        await saveWatchState({
            channelId: result.channelId,
            resourceId: result.resourceId,
            expiration: Number(result.expiration),
        });

        const expiresAt = new Date(Number(result.expiration)).toISOString();
        console.log(`Watch renewed successfully. New expiration: ${expiresAt}`);

        return NextResponse.json({
            success: true,
            action: 'renewed',
            message: 'Watch renewed successfully',
            channelId: result.channelId,
            expiresAt,
        });

    } catch (error) {
        console.error('Failed to renew Drive watch:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/drive/watch/renew
 * Stops the current watch and clears state. Use when disabling webhook-based detection.
 */
export async function DELETE() {
    try {
        const currentState = await getWatchState();

        if (!currentState) {
            return NextResponse.json({
                success: true,
                message: 'No active watch to stop',
            });
        }

        await stopWatching(currentState.channelId, currentState.resourceId);
        await clearWatchState();

        return NextResponse.json({
            success: true,
            message: 'Watch stopped and state cleared',
        });

    } catch (error) {
        console.error('Failed to stop watch:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}
