import { config } from 'dotenv';
config();

import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { parse } from 'url';
import {
    hasValidInternalApiSecret,
    INTERNAL_API_SECRET_HEADER_NAME,
} from '../src/lib/internal-api-auth';

const hostname = process.env.BIND_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '8080', 10);
const MAX_QUEUE_BODY_BYTES = 1024 * 1024;

function getSingleHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
    const body = JSON.stringify(payload);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
    res.end(body);
}

function sendText(res: ServerResponse, statusCode: number, body: string) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
    res.end(body);
}

function readRawBody(req: IncomingMessage, maxBytes = MAX_QUEUE_BODY_BYTES): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        req.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                reject(new Error(`Request body too large: ${totalBytes} bytes`));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
        });

        req.on('error', (error) => {
            reject(error);
        });
    });
}

async function handleGrading(rawBody: string, res: ServerResponse) {
    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    const data = payload as { fileId?: unknown; fileName?: unknown };
    const fileId = typeof data.fileId === 'string' ? data.fileId.trim() : '';
    const fileName = typeof data.fileName === 'string' ? data.fileName.trim() : '';

    if (!fileId || !fileName) {
        sendJson(res, 400, { error: 'Missing fileId or fileName' });
        return;
    }

    const { processFile } = await import('../src/lib/grading-service');
    await processFile(fileId, fileName);
    sendJson(res, 200, { success: true });
}

async function handleDriveCheck(rawBody: string, res: ServerResponse) {
    let reason = 'cloud-tasks';
    if (rawBody.trim()) {
        let payload: unknown;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            sendJson(res, 400, { error: 'Invalid JSON body' });
            return;
        }

        const data = payload as { source?: unknown; state?: unknown; channelId?: unknown };
        const source = typeof data.source === 'string' ? data.source.trim() : '';
        const state = typeof data.state === 'string' ? data.state.trim() : null;
        const channelId = typeof data.channelId === 'string' ? data.channelId.trim() : null;
        if (source) {
            reason = `cloud-tasks:${source}`;
        }

        console.log(
            `[Worker] Received drive check task. source=${source || 'unknown'} state=${state || 'null'} channelId=${channelId || 'null'}`,
        );
    }

    const { secureDriveCheck } = await import('../src/lib/grading-service');
    await secureDriveCheck(reason);
    sendJson(res, 200, { success: true });
}

async function handleGuidanceSummary(rawBody: string, res: ServerResponse) {
    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    const data = payload as { recordId?: unknown; durationMinutes?: unknown; timeZone?: unknown };
    const recordId = typeof data.recordId === 'string' ? data.recordId.trim() : '';
    const durationMinutes = typeof data.durationMinutes === 'number' && Number.isFinite(data.durationMinutes)
        ? Math.max(1, Math.round(data.durationMinutes))
        : null;
    const timeZone = typeof data.timeZone === 'string' ? data.timeZone.trim() : null;

    if (!recordId) {
        sendJson(res, 400, { error: 'Missing recordId' });
        return;
    }

    const { processGuidanceSummaryJob } = await import('../src/lib/guidance-summary-job');
    const result = await processGuidanceSummaryJob({
        recordId,
        durationMinutes,
        timeZone,
    });

    sendJson(res, 200, { success: true, ...result });
}

async function handleManualDriveCheck(req: IncomingMessage, res: ServerResponse) {
    const authHeader = getSingleHeader(req.headers.authorization);
    const secretHeader = getSingleHeader(req.headers[INTERNAL_API_SECRET_HEADER_NAME]);

    if (!hasValidInternalApiSecret(secretHeader, authHeader, process.env.INTERNAL_API_SECRET)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }

    const { acquireGradingLock, releaseGradingLock } = await import('../src/lib/grading-lock');
    const lockLease = await acquireGradingLock();
    if (!lockLease) {
        sendJson(res, 429, { success: false, message: 'Processing in progress' });
        return;
    }

    try {
        const { checkDriveForNewFiles } = await import('../src/lib/grading-service');
        await checkDriveForNewFiles();
        sendJson(res, 200, { success: true, message: 'Drive check completed' });
    } finally {
        await releaseGradingLock(lockLease);
    }
}

async function handleCloudRunMinInstances(rawBody: string, req: IncomingMessage, res: ServerResponse) {
    const authHeader = getSingleHeader(req.headers.authorization);
    const secretHeader = getSingleHeader(req.headers[INTERNAL_API_SECRET_HEADER_NAME]);

    if (!hasValidInternalApiSecret(secretHeader, authHeader, process.env.INTERNAL_API_SECRET)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }

    let requestBody: unknown;
    try {
        requestBody = JSON.parse(rawBody);
    } catch {
        sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
        return;
    }

    const {
        CloudRunServiceScalingError,
        parseCloudRunMinInstancesPayload,
        resolveCloudRunServiceTarget,
        summarizeCloudRunScalingErrorDetails,
        updateCloudRunMinInstances,
    } = await import('../src/lib/cloud-run-service-scaling');

    const payload = parseCloudRunMinInstancesPayload(requestBody);
    if (!payload) {
        sendJson(res, 400, { success: false, error: 'Invalid request body' });
        return;
    }

    try {
        const target = resolveCloudRunServiceTarget();
        const result = await updateCloudRunMinInstances(target, payload);

        sendJson(res, 200, {
            success: true,
            reason: payload.reason,
            requestedMinInstances: payload.minInstances,
            appliedMinInstances: result.appliedMinInstances,
            operationName: result.operationName,
            cloudRunStatus: result.status,
        });
    } catch (error) {
        if (error instanceof CloudRunServiceScalingError) {
            console.error('[CloudRunMinInstances] Failed to update worker service min instances:', {
                message: error.message,
                status: error.status,
                detailSummary: summarizeCloudRunScalingErrorDetails(error.details),
            });

            sendJson(res, error.status, {
                success: false,
                error: error.message,
            });
            return;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[CloudRunMinInstances] Failed to update worker service min instances:', {
            message,
        });
        sendJson(res, 500, { success: false, error: message });
    }
}

console.log(`[Worker] Booting HTTP server on ${hostname}:${port} ...`);

const server = createServer(async (req, res) => {
    const method = req.method || 'GET';
    const pathname = parse(req.url || '', true).pathname || '/';

    try {
        if (method === 'GET' && (pathname === '/' || pathname === '/healthz')) {
            sendText(res, 200, 'ok');
            return;
        }

        if (method === 'GET' && pathname === '/api/grading/check') {
            await handleManualDriveCheck(req, res);
            return;
        }

        if (method === 'POST' && pathname === '/api/internal/cloud-run/min-instances') {
            const rawBody = await readRawBody(req);
            await handleCloudRunMinInstances(rawBody, req, res);
            return;
        }

        if (
            method === 'POST'
            && (
                pathname === '/api/queue/grading'
                || pathname === '/api/queue/drive-check'
                || pathname === '/api/queue/guidance-summary'
            )
        ) {
            const rawBody = await readRawBody(req);

            if (pathname === '/api/queue/grading') {
                await handleGrading(rawBody, res);
                return;
            }

            if (pathname === '/api/queue/guidance-summary') {
                await handleGuidanceSummary(rawBody, res);
                return;
            }

            await handleDriveCheck(rawBody, res);
            return;
        }

        sendJson(res, 404, { error: 'Not Found' });
    } catch (error) {
        console.error(`[Worker] Request failed: ${method} ${pathname}`, error);
        sendJson(res, 500, { error: 'Internal Server Error' });
    }
});

server.on('error', (err) => {
    console.error('[Worker] HTTP server error:', err);
});

server.listen(port, hostname, () => {
    console.log(`[Worker] Listening on http://${hostname}:${port}`);
});
