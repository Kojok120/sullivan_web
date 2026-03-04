import { config } from 'dotenv';
config(); // Load .env file

import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import type { Duplex } from 'stream';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { setupGeminiSocket } from './src/lib/gemini-socket-proxy';
import { verifyGeminiLiveSessionToken } from './src/lib/gemini-live-session-token';
import { warmupPdfBrowser } from './src/lib/print-pdf/browser';

type GeminiSocketContext = {
    userId: string;
    resumeHandle?: string;
};

type GeminiUpgradeRequest = IncomingMessage & {
    geminiSocketContext?: GeminiSocketContext;
};

function normalizeResumeHandle(value: unknown) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > 2048) return undefined;
    return trimmed;
}

function rejectUpgrade(socket: Duplex, statusCode: 401 | 400, reason: string) {
    if (socket.destroyed) return;
    try {
        socket.write(
            `HTTP/1.1 ${statusCode} ${statusCode === 401 ? 'Unauthorized' : 'Bad Request'}\r\n`
            + 'Connection: close\r\n'
            + 'Content-Type: text/plain\r\n'
            + `Content-Length: ${Buffer.byteLength(reason, 'utf8')}\r\n`
            + '\r\n'
            + reason,
        );
    } catch (error) {
        console.error('[Server] Failed to write upgrade rejection response:', error);
    } finally {
        socket.destroy();
    }
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.BIND_HOST || (dev ? '127.0.0.1' : '0.0.0.0');
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
let handle: ReturnType<typeof app.getRequestHandler> | null = null;
let handleUpgrade: ReturnType<typeof app.getUpgradeHandler> | null = null;
let isPrepared = false;
let preparationError: string | null = null;

function replyNotReady(res: ServerResponse) {
    if (preparationError) {
        res.statusCode = 500;
        res.end('Server startup failed');
        return;
    }
    // Cloud Run の起動判定を妨げないよう、準備中でも即時に応答する。
    res.statusCode = 200;
    res.end('Server is starting');
}

const server = createServer(async (req, res) => {
    try {
        if (!isPrepared || !handle) {
            replyNotReady(res);
            return;
        }
        const parsedUrl = parse(req.url!, true);
        await handle(req, res, parsedUrl);
    } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
    }
});
server.on('error', (err) => {
    console.error('[Server] HTTP server error:', err);
});

// Only handle /ws upgrades here. Let Next.js handle its own upgrade routes (e.g. HMR).
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
    console.log('Client connected to WebSocket for Gemini');
    const context = (req as GeminiUpgradeRequest).geminiSocketContext;
    if (!context) {
        ws.close(1008, 'Unauthorized');
        return;
    }

    setupGeminiSocket(ws, {
        userId: context.userId,
        resumeHandle: context.resumeHandle,
    });
});

server.on('upgrade', (req, socket, head) => {
    if (!isPrepared || !handleUpgrade) {
        rejectUpgrade(socket, 400, 'Server is starting');
        return;
    }

    const { pathname } = parse(req.url || '', true);

    if (pathname === '/ws') {
        const parsedUrl = parse(req.url || '', true);
        const tokenRaw = parsedUrl.query.token;
        const token = typeof tokenRaw === 'string' ? tokenRaw : '';

        const verified = verifyGeminiLiveSessionToken(token);
        if (!verified.valid || !verified.userId) {
            console.warn(`[Server] Rejected /ws upgrade. reason=${verified.reason || 'unknown'}`);
            rejectUpgrade(socket, 401, 'Unauthorized');
            return;
        }

        const resumeHandle = normalizeResumeHandle(parsedUrl.query.resumeHandle);
        (req as GeminiUpgradeRequest).geminiSocketContext = {
            userId: verified.userId,
            resumeHandle,
        };

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req as GeminiUpgradeRequest);
        });
        return;
    }

    handleUpgrade(req, socket, head).catch((err) => {
        console.error('Error occurred handling upgrade', req.url, err);
        if (!socket.destroyed) {
            socket.destroy();
        }
    });
});

console.log(`[Server] Booting HTTP server on ${hostname}:${port} (dev=${dev}) ...`);
server.listen(port, hostname, () => {
    console.log(`[Server] Listening on http://${hostname}:${port}`);
});

console.log(`[Server] Preparing Next app (dev=${dev}) ...`);
app.prepare().then(() => {
    handle = app.getRequestHandler();
    handleUpgrade = app.getUpgradeHandler();
    isPrepared = true;
    console.log('[Server] Next app prepared');
    console.log(`> Ready on http://${hostname}:${port}`);

    void warmupPdfBrowser()
        .then(() => {
            console.log('[Server] PDF browser warmup completed');
        })
        .catch((error) => {
            console.warn('[Server] PDF browser warmup failed:', error);
        });
}).catch((err) => {
    preparationError = err instanceof Error ? err.message : 'Unknown startup error';
    console.error('[Server] Failed to prepare Next app:', err);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 100);
});
