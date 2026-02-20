import { config } from 'dotenv';
config();

import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { Receiver } from '@upstash/qstash';
import { parse } from 'url';

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

function buildRequestUrl(req: IncomingMessage) {
    const host = getSingleHeader(req.headers.host);
    if (!host) return undefined;
    const proto = getSingleHeader(req.headers['x-forwarded-proto']) || 'https';
    return `${proto}://${host}${req.url || ''}`;
}

async function verifyQueueSignature(req: IncomingMessage, rawBody: string) {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    const signature = getSingleHeader(req.headers['upstash-signature']);

    if (!currentSigningKey || !nextSigningKey) {
        console.error('[Worker] Missing QStash signing keys');
        return false;
    }
    if (!signature) {
        console.warn('[Worker] Missing upstash-signature header');
        return false;
    }

    const receiver = new Receiver({ currentSigningKey, nextSigningKey });

    try {
        return await receiver.verify({
            signature,
            body: rawBody,
            url: buildRequestUrl(req),
        });
    } catch (error) {
        console.error('[Worker] Failed to verify QStash signature:', error);
        return false;
    }
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

async function handleDriveCheck(res: ServerResponse) {
    const { secureDriveCheck } = await import('../src/lib/grading-service');
    await secureDriveCheck('webhook-qstash-queue');
    sendJson(res, 200, { success: true });
}

async function handleManualDriveCheck(req: IncomingMessage, res: ServerResponse) {
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    const authHeader = getSingleHeader(req.headers.authorization);

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
    }

    const { acquireGradingLock, releaseGradingLock } = await import('../src/lib/grading-lock');
    const lockAcquired = await acquireGradingLock();
    if (!lockAcquired) {
        sendJson(res, 429, { success: false, message: 'Processing in progress' });
        return;
    }

    try {
        const { checkDriveForNewFiles } = await import('../src/lib/grading-service');
        await checkDriveForNewFiles();
        sendJson(res, 200, { success: true, message: 'Drive check completed' });
    } finally {
        await releaseGradingLock();
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

        if (
            method === 'POST'
            && (pathname === '/api/queue/grading' || pathname === '/api/queue/drive-check')
        ) {
            const rawBody = await readRawBody(req);
            const verified = await verifyQueueSignature(req, rawBody);
            if (!verified) {
                sendJson(res, 401, { error: 'Invalid signature' });
                return;
            }

            if (pathname === '/api/queue/grading') {
                await handleGrading(rawBody, res);
                return;
            }

            await handleDriveCheck(res);
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
