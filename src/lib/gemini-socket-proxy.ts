import WebSocket, { RawData } from 'ws';

const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-09-2025";
const GEMINI_API_VERSION = process.env.GEMINI_LIVE_API_VERSION || "v1beta";
const GEMINI_VOICE = process.env.GEMINI_LIVE_VOICE || "Aoede";
const MAX_PENDING_MESSAGES = 200;
const RESERVED_CLOSE_CODES = new Set([1004, 1005, 1006, 1015]);

function rawDataToUtf8(data: RawData): string {
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data.toString('utf-8');
    if (Array.isArray(data)) return Buffer.concat(data).toString('utf-8');
    return Buffer.from(data).toString('utf-8');
}

function normalizeCloseCode(code?: number): number {
    if (!Number.isInteger(code)) return 1000;
    const validatedCode = code as number;
    if (validatedCode === 1000) return 1000;
    if (
        (validatedCode >= 1001 && validatedCode <= 1014 && !RESERVED_CLOSE_CODES.has(validatedCode)) ||
        (validatedCode >= 3000 && validatedCode <= 4999)
    ) {
        return validatedCode;
    }
    return 1000;
}

function normalizeCloseReason(reason?: string): string {
    if (!reason) return '';
    let safeReason = reason.trim();
    while (Buffer.byteLength(safeReason, 'utf8') > 123) {
        safeReason = safeReason.slice(0, -1);
    }
    return safeReason;
}

function safeClose(ws: WebSocket, code?: number, reason?: string) {
    if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) return;

    const safeCode = normalizeCloseCode(code);
    const safeReason = normalizeCloseReason(reason);

    try {
        if (safeReason) {
            ws.close(safeCode, safeReason);
            return;
        }
        ws.close(safeCode);
    } catch (err) {
        console.error('[GeminiProxy] Failed to close socket cleanly, terminating:', err);
        ws.terminate();
    }
}

export function setupGeminiSocket(clientWs: WebSocket) {
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        console.error("[GeminiProxy] GEMINI_API_KEY is not set");
        safeClose(clientWs, 1008, "API Key Missing");
        return;
    }

    console.log("[GeminiProxy] API Key found, connecting to Gemini...");

    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${GEMINI_API_VERSION}.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

    const geminiWs = new WebSocket(geminiUrl);
    let isSetupComplete = false;
    const pendingClientMessages: string[] = [];
    let audioFrameCount = 0;
    let lastAudioFrameLogAt = Date.now();

    const queueOrForwardMessage = (message: string) => {
        if (!isSetupComplete) {
            if (pendingClientMessages.length >= MAX_PENDING_MESSAGES) {
                pendingClientMessages.shift();
            }
            pendingClientMessages.push(message);
            return;
        }

        if (geminiWs.readyState !== WebSocket.OPEN) {
            console.warn("[GeminiProxy] Gemini WS not open, cannot forward client message");
            return;
        }

        geminiWs.send(message);
    };

    const flushPendingMessages = () => {
        if (!isSetupComplete || geminiWs.readyState !== WebSocket.OPEN) return;
        while (pendingClientMessages.length > 0) {
            const nextMessage = pendingClientMessages.shift();
            if (!nextMessage) continue;
            geminiWs.send(nextMessage);
        }
    };

    geminiWs.on('open', () => {
        console.log(`[GeminiProxy] Connected to Gemini Live API (model=${DEFAULT_LIVE_MODEL}, api=${GEMINI_API_VERSION})`);

        // Initial Setup Message
        const setupMessage = {
            setup: {
                model: `models/${DEFAULT_LIVE_MODEL}`,
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } }
                    }
                }
            }
        };
        console.log('[GeminiProxy] Sending setup message...');
        geminiWs.send(JSON.stringify(setupMessage));
    });

    // Handle messages from Client -> Gemini
    clientWs.on('message', (data: RawData) => {
        try {
            const message = rawDataToUtf8(data);
            if (!message) return;

            let isAudioFrame = false;
            try {
                const parsed = JSON.parse(message);
                isAudioFrame = Boolean(parsed?.realtimeInput?.audio?.data);
            } catch {
                // Ignore parse errors for logging classification.
            }

            if (isAudioFrame) {
                audioFrameCount += 1;
                const now = Date.now();
                if (now - lastAudioFrameLogAt >= 5000) {
                    console.log(`[GeminiProxy] Client -> Gemini realtime audio frames: ${audioFrameCount}/5s`);
                    audioFrameCount = 0;
                    lastAudioFrameLogAt = now;
                }
            } else {
                console.log(`[GeminiProxy] Client -> Gemini: ${message.substring(0, 100)}...`);
            }

            queueOrForwardMessage(message);
        } catch (err) {
            console.error("[GeminiProxy] Error forwarding client message:", err);
        }
    });

    // Handle messages from Gemini -> Client
    geminiWs.on('message', (data: RawData) => {
        if (clientWs.readyState !== WebSocket.OPEN) {
            console.warn("[GeminiProxy] Client WS not open, cannot forward Gemini message");
            return;
        }

        try {
            const message = rawDataToUtf8(data);
            if (!message) return;

            try {
                const parsed = JSON.parse(message);
                if (parsed.setupComplete !== undefined) {
                    isSetupComplete = true;
                    console.log('[GeminiProxy] setupComplete received');
                    flushPendingMessages();
                }
                if (parsed.goAway) {
                    console.warn(`[GeminiProxy] goAway from Gemini: ${JSON.stringify(parsed.goAway).slice(0, 300)}`);
                }
                if (parsed.error) {
                    console.error(`[GeminiProxy] error frame from Gemini: ${JSON.stringify(parsed.error).slice(0, 300)}`);
                }
            } catch {
                // Pass through non-JSON payloads as-is.
            }

            clientWs.send(message);
        } catch (err) {
            console.error("[GeminiProxy] Error forwarding Gemini message:", err);
        }
    });

    // Error handling
    geminiWs.on('error', (err: Error) => {
        console.error("[GeminiProxy] Gemini WS Error:", err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
            safeClose(clientWs, 1011, "Gemini Error");
        }
    });

    clientWs.on('error', (err: Error) => {
        console.error("[GeminiProxy] Client WS Error:", err.message);
        if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
            safeClose(geminiWs, 1000, "Client Error");
        }
    });

    // Close handling with RFC-safe close codes
    clientWs.on('close', (code: number, reason: Buffer) => {
        const reasonText = reason.toString('utf-8');
        console.log(`[GeminiProxy] Client WS closed: code=${normalizeCloseCode(code)} reason=${reasonText}`);
        if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
            safeClose(geminiWs, 1000, "Client Closed");
        }
    });

    geminiWs.on('close', (code: number, reason: Buffer) => {
        const reasonText = reason.toString('utf-8');
        const safeCode = normalizeCloseCode(code);
        console.log(`[GeminiProxy] Gemini WS closed: code=${safeCode} reason=${reasonText}`);
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
            safeClose(clientWs, safeCode, reasonText);
        }
    });
}
