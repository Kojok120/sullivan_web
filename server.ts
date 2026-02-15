import { config } from 'dotenv';
config(); // Load .env file
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { setupGeminiSocket } from './src/lib/gemini-socket-proxy';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.BIND_HOST || (dev ? '127.0.0.1' : '0.0.0.0');
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

console.log(`[Server] Preparing Next app (dev=${dev}) on ${hostname}:${port} ...`);

app.prepare().then(() => {
    console.log('[Server] Next app prepared');
    const handleUpgrade = app.getUpgradeHandler();

    const server = createServer(async (req, res) => {
        try {
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
        setupGeminiSocket(ws);
    });

    server.on('upgrade', (req, socket, head) => {
        const { pathname } = parse(req.url || '', true);

        if (pathname === '/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
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

    server.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
}).catch((err) => {
    console.error('[Server] Failed to prepare Next app:', err);
});
