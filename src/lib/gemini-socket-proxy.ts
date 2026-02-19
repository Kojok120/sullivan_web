import crypto from 'node:crypto';
import WebSocket, { RawData } from 'ws';

type SetupGeminiSocketOptions = {
    userId: string;
    resumeHandle?: string;
};

const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview';
const GEMINI_API_VERSION = process.env.GEMINI_LIVE_API_VERSION || 'v1beta';
const GEMINI_VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede';
const MAX_PENDING_MESSAGES = 300;
const RESERVED_CLOSE_CODES = new Set([1004, 1005, 1006, 1015]);
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_GEMINI_RECONNECT_ATTEMPTS = 4;
const GEMINI_RECONNECT_BASE_DELAY_MS = 500;

type SessionResumptionUpdate = {
    newHandle?: string;
    resumable?: boolean;
};

function parseNumber(value: string | undefined, fallback: number, min: number, max: number) {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

const CONTEXT_WINDOW_TRIGGER_TOKENS = parseNumber(
    process.env.GEMINI_LIVE_CONTEXT_TRIGGER_TOKENS,
    28_672,
    8_192,
    1_000_000,
);

const CONTEXT_WINDOW_TARGET_TOKENS = Math.min(
    CONTEXT_WINDOW_TRIGGER_TOKENS - 1,
    parseNumber(
        process.env.GEMINI_LIVE_CONTEXT_TARGET_TOKENS,
        20_480,
        4_096,
        999_999,
    ),
);

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
        (validatedCode >= 1001 && validatedCode <= 1014 && !RESERVED_CLOSE_CODES.has(validatedCode))
        || (validatedCode >= 3000 && validatedCode <= 4999)
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

function parseMessageIfJson(message: string) {
    try {
        return JSON.parse(message) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function anonymizeUserId(userId: string) {
    return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

function buildReconnectDelayMs(attempt: number) {
    const exponent = Math.max(0, attempt - 1);
    const base = GEMINI_RECONNECT_BASE_DELAY_MS * (2 ** exponent);
    const jitter = Math.floor(Math.random() * 200);
    return Math.min(8_000, base + jitter);
}

function shouldRetryGeminiClose(code: number, reasonText: string) {
    // 1007 はペイロード不正。再接続しても同一 setup を再送するだけなので即時失敗扱いにする。
    if (code === 1007) return false;

    const reason = reasonText.toLowerCase();
    if (reason.includes('invalid json payload') || reason.includes('cannot find field')) {
        return false;
    }

    return true;
}

function buildSetupMessage(resumeHandle?: string) {
    // Gemini API の sessionResumption では handle のみ指定可能。
    const sessionResumption: { handle?: string } = {};

    if (resumeHandle) {
        sessionResumption.handle = resumeHandle;
    }

    return {
        setup: {
            model: `models/${DEFAULT_LIVE_MODEL}`,
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: GEMINI_VOICE },
                    },
                },
            },
            realtimeInputConfig: {
                automaticActivityDetection: {
                    disabled: false,
                    startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                    endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                    prefixPaddingMs: 120,
                    silenceDurationMs: 450,
                },
                activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
                turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption,
            contextWindowCompression: {
                triggerTokens: String(CONTEXT_WINDOW_TRIGGER_TOKENS),
                slidingWindow: {
                    targetTokens: String(CONTEXT_WINDOW_TARGET_TOKENS),
                },
            },
        },
    };
}

export function setupGeminiSocket(clientWs: WebSocket, options: SetupGeminiSocketOptions) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('[GeminiProxy] GEMINI_API_KEY is not set');
        safeClose(clientWs, 1008, 'API Key Missing');
        return;
    }

    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${GEMINI_API_VERSION}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const userLogId = anonymizeUserId(options.userId);

    let geminiWs: WebSocket | null = null;
    let isSetupComplete = false;
    let isShuttingDown = false;
    let clientAlive = true;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let latestResumeHandle = options.resumeHandle;

    const pendingClientMessages: string[] = [];

    const clearReconnectTimer = () => {
        if (!reconnectTimer) return;
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    };

    const heartbeatTimer = setInterval(() => {
        if (clientWs.readyState !== WebSocket.OPEN) return;

        if (!clientAlive) {
            console.warn('[GeminiProxy] Client heartbeat timeout');
            safeClose(clientWs, 1001, 'Client heartbeat timeout');
            return;
        }

        clientAlive = false;
        try {
            clientWs.ping();
        } catch (error) {
            console.error('[GeminiProxy] Failed to ping client:', error);
        }
    }, CLIENT_HEARTBEAT_MS);

    const cleanup = () => {
        clearInterval(heartbeatTimer);
        clearReconnectTimer();
    };

    const queueMessage = (message: string) => {
        if (pendingClientMessages.length >= MAX_PENDING_MESSAGES) {
            pendingClientMessages.shift();
        }
        pendingClientMessages.push(message);
    };

    const flushPendingMessages = () => {
        if (!isSetupComplete || !geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;

        while (pendingClientMessages.length > 0) {
            const nextMessage = pendingClientMessages.shift();
            if (!nextMessage) continue;
            geminiWs.send(nextMessage);
        }
    };

    const queueOrForwardMessage = (message: string) => {
        if (!isSetupComplete || !geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
            queueMessage(message);
            return;
        }

        geminiWs.send(message);
    };

    const openGeminiConnection = () => {
        if (isShuttingDown) return;
        if (geminiWs && (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING)) {
            return;
        }

        isSetupComplete = false;

        const ws = new WebSocket(geminiUrl);
        geminiWs = ws;

        ws.on('open', () => {
            if (geminiWs !== ws || isShuttingDown) return;

            console.log(
                `[GeminiProxy] Connected to Gemini Live API user=${userLogId} model=${DEFAULT_LIVE_MODEL} api=${GEMINI_API_VERSION}`,
            );
            ws.send(JSON.stringify(buildSetupMessage(latestResumeHandle)));
        });

        ws.on('message', (data: RawData) => {
            if (geminiWs !== ws) return;

            try {
                const message = rawDataToUtf8(data);
                if (!message) return;

                const parsed = parseMessageIfJson(message);
                if (parsed?.setupComplete !== undefined) {
                    isSetupComplete = true;
                    reconnectAttempt = 0;
                    flushPendingMessages();
                }

                if (parsed?.error) {
                    console.error(`[GeminiProxy] error frame from Gemini: ${JSON.stringify(parsed.error).slice(0, 500)}`);
                }

                if (parsed?.goAway) {
                    console.warn(`[GeminiProxy] goAway from Gemini user=${userLogId}: ${JSON.stringify(parsed.goAway).slice(0, 300)}`);
                }

                if (parsed?.sessionResumptionUpdate) {
                    const update = parsed.sessionResumptionUpdate as SessionResumptionUpdate;
                    if (typeof update.newHandle === 'string' && update.newHandle.trim()) {
                        latestResumeHandle = update.newHandle.trim();
                    }

                    console.log(
                        `[GeminiProxy] sessionResumptionUpdate user=${userLogId} resumable=${String(update?.resumable)} handle=${update?.newHandle ? 'present' : 'empty'}`,
                    );
                }

                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(message);
                    return;
                }

                safeClose(ws, 1000, 'Client not open');
            } catch (err) {
                console.error('[GeminiProxy] Error forwarding Gemini message:', err);
            }
        });

        ws.on('error', (err: Error) => {
            if (geminiWs !== ws) return;
            console.error('[GeminiProxy] Gemini WS Error:', err.message);
        });

        ws.on('close', (code: number, reason: Buffer) => {
            if (geminiWs === ws) {
                geminiWs = null;
            }

            const reasonText = reason.toString('utf-8');
            const safeCode = normalizeCloseCode(code);
            console.log(`[GeminiProxy] Gemini WS closed user=${userLogId} code=${safeCode} reason=${reasonText}`);

            if (isShuttingDown) {
                return;
            }

            isSetupComplete = false;

            if (!shouldRetryGeminiClose(safeCode, reasonText)) {
                console.error(
                    `[GeminiProxy] Non-retryable Gemini close user=${userLogId} code=${safeCode} reason=${reasonText}`,
                );
                if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
                    safeClose(clientWs, 1011, 'Gemini setup rejected');
                }
                return;
            }

            if (reconnectAttempt >= MAX_GEMINI_RECONNECT_ATTEMPTS) {
                if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
                    safeClose(clientWs, 1011, 'Gemini reconnect limit exceeded');
                }
                return;
            }

            reconnectAttempt += 1;
            const delayMs = buildReconnectDelayMs(reconnectAttempt);
            console.warn(
                `[GeminiProxy] Reconnecting to Gemini (${reconnectAttempt}/${MAX_GEMINI_RECONNECT_ATTEMPTS}) in ${delayMs}ms user=${userLogId}`,
            );

            clearReconnectTimer();
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                openGeminiConnection();
            }, delayMs);
        });
    };

    clientWs.on('pong', () => {
        clientAlive = true;
    });

    clientWs.on('message', (data: RawData) => {
        try {
            const message = rawDataToUtf8(data);
            if (!message) return;
            queueOrForwardMessage(message);
        } catch (err) {
            console.error('[GeminiProxy] Error forwarding client message:', err);
        }
    });

    clientWs.on('error', (err: Error) => {
        console.error('[GeminiProxy] Client WS Error:', err.message);
        isShuttingDown = true;
        cleanup();
        if (geminiWs && (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING)) {
            safeClose(geminiWs, 1000, 'Client Error');
        }
    });

    clientWs.on('close', (code: number, reason: Buffer) => {
        const reasonText = reason.toString('utf-8');
        console.log(`[GeminiProxy] Client WS closed user=${userLogId} code=${normalizeCloseCode(code)} reason=${reasonText}`);

        isShuttingDown = true;
        cleanup();

        if (geminiWs && (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING)) {
            safeClose(geminiWs, 1000, 'Client Closed');
        }
    });

    openGeminiConnection();
}
