import { NextResponse } from 'next/server';
import {
    hasValidInternalApiSecret,
    INTERNAL_API_SECRET_HEADER_NAME,
} from '@/lib/internal-api-auth';

export function getShouldCheckFromRequest(request: Request): boolean {
    const url = new URL(request.url);
    return ['1', 'true'].includes(url.searchParams.get('check') || '');
}

export function verifyInternalApiAuthorization(request: Request): NextResponse | null {
    const authHeader = request.headers.get('Authorization');
    const secretHeader = request.headers.get(INTERNAL_API_SECRET_HEADER_NAME);

    if (!hasValidInternalApiSecret(secretHeader, authHeader, process.env.INTERNAL_API_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
}

export function getDriveWebhookUrlOrError(): { webhookUrl: string } | { errorResponse: NextResponse } {
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
        return {
            errorResponse: NextResponse.json(
                { success: false, error: 'APP_URL is not configured' },
                { status: 500 }
            )
        };
    }
    return { webhookUrl: `${appUrl}/api/grading/webhook` };
}

export async function queueDriveCheck(source: string, logPrefix: string): Promise<NextResponse | null> {
    try {
        const { publishDriveCheckJob } = await import('@/lib/grading-job');
        await publishDriveCheckJob(source, null, null);
        return null;
    } catch (error) {
        console.error(`[${logPrefix}] Failed to queue drive check. source=${source}`, error);
        return NextResponse.json(
            { success: false, error: 'Queue mechanism unavailable' },
            { status: 503 },
        );
    }
}
