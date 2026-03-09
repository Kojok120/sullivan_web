import { NextResponse } from 'next/server';

import {
    CloudRunServiceScalingError,
    parseCloudRunMinInstancesPayload,
    resolveCloudRunServiceTarget,
    summarizeCloudRunScalingErrorDetails,
    updateCloudRunMinInstances,
} from '@/lib/cloud-run-service-scaling';
import { verifyInternalApiAuthorization } from '@/lib/drive-watch-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cloud Scheduler からのみ呼び出す内部 API。
 * Cloud Run の service-level min instances を平日営業時間に合わせて切り替える。
 */
export async function POST(request: Request) {
    const unauthorizedResponse = verifyInternalApiAuthorization(request);
    if (unauthorizedResponse) {
        return unauthorizedResponse;
    }

    let requestBody: unknown;
    try {
        requestBody = await request.json();
    } catch {
        return NextResponse.json(
            { success: false, error: 'Invalid JSON body' },
            { status: 400 },
        );
    }

    const payload = parseCloudRunMinInstancesPayload(requestBody);
    if (!payload) {
        return NextResponse.json(
            { success: false, error: 'Invalid request body' },
            { status: 400 },
        );
    }

    try {
        const target = resolveCloudRunServiceTarget();
        const result = await updateCloudRunMinInstances(target, payload);

        return NextResponse.json({
            success: true,
            reason: payload.reason,
            requestedMinInstances: payload.minInstances,
            appliedMinInstances: result.appliedMinInstances,
            operationName: result.operationName,
            cloudRunStatus: result.status,
        });
    } catch (error) {
        if (error instanceof CloudRunServiceScalingError) {
            console.error('[CloudRunMinInstances] Failed to update service min instances:', {
                message: error.message,
                status: error.status,
                detailSummary: summarizeCloudRunScalingErrorDetails(error.details),
            });

            return NextResponse.json(
                {
                    success: false,
                    error: error.message,
                },
                { status: error.status },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[CloudRunMinInstances] Failed to update service min instances:', {
            message,
        });
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 },
        );
    }
}
