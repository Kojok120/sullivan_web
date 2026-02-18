import { NextResponse } from 'next/server';
import { watchDriveFolder } from '@/lib/drive-webhook-manager';
import { saveWatchState, getWatchState } from '@/lib/drive-watch-state';
import { secureDriveCheck } from '@/lib/grading-service';
import { getDriveWebhookUrlOrError, getShouldCheckFromRequest, verifyInternalApiAuthorization } from '@/lib/drive-watch-api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/drive/watch/setup
 * Registers a new Google Drive Push Notification watch for the configured folder.
 * This should be called once after deployment, or when the watch expires.
 */
export async function POST(request: Request) {
    try {
        const shouldCheck = getShouldCheckFromRequest(request);
        const unauthorizedResponse = verifyInternalApiAuthorization(request);
        if (unauthorizedResponse) {
            return unauthorizedResponse;
        }

        const webhookResult = getDriveWebhookUrlOrError();
        if ('errorResponse' in webhookResult) {
            return webhookResult.errorResponse;
        }
        const { webhookUrl } = webhookResult;
        console.log(`Setting up Drive watch with webhook URL: ${webhookUrl}`);

        // Check if there's an existing watch
        const existingState = await getWatchState();
        if (existingState && existingState.expiration > Date.now()) {
            const expiresIn = Math.round((existingState.expiration - Date.now()) / 1000 / 60);
            console.log(`Existing watch found, expires in ${expiresIn} minutes`);
            if (shouldCheck) {
                await secureDriveCheck('setup-skip');
            }
            return NextResponse.json({
                success: true,
                message: 'Watch already active',
                channelId: existingState.channelId,
                expiresIn: `${expiresIn} minutes`,
            });
        }

        // Register new watch
        const result = await watchDriveFolder(webhookUrl);

        // Save state to Redis
        await saveWatchState({
            channelId: result.channelId,
            resourceId: result.resourceId,
            token: result.token,
            expiration: Number(result.expiration),
        });

        const expiresAt = new Date(Number(result.expiration)).toISOString();
        console.log(`Watch registered successfully. Expires at: ${expiresAt}`);
        if (shouldCheck) {
            await secureDriveCheck('setup');
        }

        return NextResponse.json({
            success: true,
            message: 'Watch registered successfully',
            channelId: result.channelId,
            resourceId: result.resourceId,
            expiresAt,
        });

    } catch (error) {
        console.error('Failed to setup Drive watch:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/drive/watch/setup
 * Returns the current watch state (for debugging/status checks)
 */
export async function GET() {
    try {
        const state = await getWatchState();
        if (!state) {
            return NextResponse.json({
                success: true,
                active: false,
                message: 'No active watch',
            });
        }

        const isActive = state.expiration > Date.now();
        const expiresIn = Math.round((state.expiration - Date.now()) / 1000 / 60);

        return NextResponse.json({
            success: true,
            active: isActive,
            channelId: state.channelId,
            resourceId: state.resourceId,
            expiresAt: new Date(state.expiration).toISOString(),
            expiresIn: isActive ? `${expiresIn} minutes` : 'expired',
        });
    } catch (error) {
        console.error('Failed to get watch state:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get watch state' },
            { status: 500 }
        );
    }
}


