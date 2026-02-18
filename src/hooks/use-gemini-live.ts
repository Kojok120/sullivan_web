import { useRef, useState, useCallback, useEffect } from 'react';
import { AudioStreamer } from '@/lib/audio-streamer';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
const CONNECTION_SETUP_TIMEOUT_MS = 12000;
const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_DELAY_MS = 800;
const NON_RETRYABLE_CLOSE_CODES = new Set([1008, 4401]);

type GeminiLiveMessage = {
    setupComplete?: unknown;
    goAway?: {
        timeLeft?: string;
    };
    sessionResumptionUpdate?: {
        newHandle?: string;
        resumable?: boolean;
        lastConsumedClientMessageIndex?: string;
    };
    serverContent?: {
        interrupted?: boolean;
        turnComplete?: boolean;
        waitingForInput?: boolean;
        outputTranscription?: {
            text?: string;
        };
        modelTurn?: {
            parts?: Array<{
                inlineData?: {
                    mimeType?: string;
                    data?: string;
                };
            }>;
        };
    };
};

function parseGeminiLiveMessage(text: string): GeminiLiveMessage | null {
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed as GeminiLiveMessage;
        }
        return null;
    } catch {
        return null;
    }
}

function shouldReconnect(code: number) {
    return !NON_RETRYABLE_CLOSE_CODES.has(code);
}

function buildReconnectDelay(attempt: number) {
    const exponent = Math.max(0, attempt - 1);
    const base = RECONNECT_BASE_DELAY_MS * (2 ** exponent);
    const jitter = Math.floor(Math.random() * 200);
    return Math.min(8_000, base + jitter);
}

async function fetchLiveSessionToken() {
    const response = await fetch('/api/gemini-live/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Live token: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { token?: string };
    const token = payload.token?.trim();
    if (!token) {
        throw new Error('Live token response does not include token');
    }

    return token;
}

export function useGeminiLive() {
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [isTalking, setIsTalking] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);

    const audioStreamerRef = useRef<AudioStreamer | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const isMicMutedRef = useRef(false);
    const manualDisconnectRef = useRef(false);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    const setupTimeoutRef = useRef<number | null>(null);
    const isSetupCompleteRef = useRef(false);
    const initialContextRef = useRef<string>('');
    const resumeHandleRef = useRef<string | null>(null);
    const talkingTimerRef = useRef<number | null>(null);
    const openSocketRef = useRef<((options: { allowReconnect: boolean }) => Promise<void>) | null>(null);
    const connectionStateRef = useRef<ConnectionState>('disconnected');

    useEffect(() => {
        connectionStateRef.current = connectionState;
    }, [connectionState]);

    const clearTalkingTimer = useCallback(() => {
        if (talkingTimerRef.current !== null) {
            window.clearTimeout(talkingTimerRef.current);
            talkingTimerRef.current = null;
        }
    }, []);

    const scheduleTalkingOff = useCallback((delayMs: number) => {
        clearTalkingTimer();
        talkingTimerRef.current = window.setTimeout(() => {
            setIsTalking(false);
            talkingTimerRef.current = null;
        }, delayMs);
    }, [clearTalkingTimer]);

    const clearSetupTimeout = useCallback(() => {
        if (setupTimeoutRef.current !== null) {
            window.clearTimeout(setupTimeoutRef.current);
            setupTimeoutRef.current = null;
        }
    }, []);

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    const setMicMuted = useCallback(async (muted: boolean) => {
        isMicMutedRef.current = muted;
        setIsMicMuted(muted);

        const audioStreamer = audioStreamerRef.current;
        if (!audioStreamer) return;

        if (muted) {
            audioStreamer.stopRecording();
            return;
        }

        if (
            connectionStateRef.current !== 'connected'
            || wsRef.current?.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        try {
            await audioStreamer.startRecording();
        } catch (error) {
            console.error('Microphone resume failed:', error);
            setConnectionState('error');
        }
    }, []);

    const toggleMic = useCallback(() => {
        void setMicMuted(!isMicMutedRef.current);
    }, [setMicMuted]);

    const openSocket = useCallback(async ({ allowReconnect }: { allowReconnect: boolean }) => {
        if (
            wsRef.current?.readyState === WebSocket.OPEN
            || wsRef.current?.readyState === WebSocket.CONNECTING
        ) {
            return;
        }

        setConnectionState('connecting');

        const token = await fetchLiveSessionToken();
        if (manualDisconnectRef.current) {
            setConnectionState('disconnected');
            return;
        }

        if (
            wsRef.current?.readyState === WebSocket.OPEN
            || wsRef.current?.readyState === WebSocket.CONNECTING
        ) {
            return;
        }

        const params = new URLSearchParams({ token });
        const resumeHandle = resumeHandleRef.current;
        if (resumeHandle) {
            params.set('resumeHandle', resumeHandle);
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?${params.toString()}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        isSetupCompleteRef.current = false;
        let initialContextSent = false;

        clearSetupTimeout();
        setupTimeoutRef.current = window.setTimeout(() => {
            if (isSetupCompleteRef.current) return;
            if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                console.error(`WS setup timeout (${CONNECTION_SETUP_TIMEOUT_MS}ms)`);
                ws.close(1011, 'Setup timeout');
            }
        }, CONNECTION_SETUP_TIMEOUT_MS);

        const sendInitialContextIfNeeded = () => {
            if (resumeHandle) return;
            const initialContext = initialContextRef.current.trim();
            if (!initialContext || initialContextSent || ws.readyState !== WebSocket.OPEN) return;

            const message = {
                clientContent: {
                    turns: [
                        {
                            role: 'user',
                            parts: [{ text: initialContext }],
                        },
                    ],
                    turnComplete: true,
                },
            };

            ws.send(JSON.stringify(message));
            initialContextSent = true;
        };

        ws.onopen = () => {
            console.log('WS connected to Gemini proxy');
        };

        ws.onmessage = async (event) => {
            try {
                const text = typeof event.data === 'string'
                    ? event.data
                    : await (new Response(event.data)).text();

                const data = parseGeminiLiveMessage(text);
                if (!data) return;

                if (typeof data.sessionResumptionUpdate?.newHandle === 'string' && data.sessionResumptionUpdate.newHandle) {
                    resumeHandleRef.current = data.sessionResumptionUpdate.newHandle;
                }

                if (data.setupComplete !== undefined && !isSetupCompleteRef.current) {
                    isSetupCompleteRef.current = true;
                    reconnectAttemptRef.current = 0;
                    clearSetupTimeout();
                    sendInitialContextIfNeeded();

                    if (!isMicMutedRef.current) {
                        try {
                            await audioStreamerRef.current?.startRecording();
                        } catch (error) {
                            console.error('Microphone start failed:', error);
                            setConnectionState('error');
                            return;
                        }
                    }

                    setConnectionState('connected');
                }

                if (data.serverContent?.interrupted) {
                    audioStreamerRef.current?.clearPlaybackQueue();
                    setIsTalking(false);
                }

                if (data.serverContent?.modelTurn?.parts) {
                    for (const part of data.serverContent.modelTurn.parts) {
                        if (
                            part.inlineData?.mimeType?.startsWith('audio/pcm')
                            && typeof part.inlineData.data === 'string'
                        ) {
                            audioStreamerRef.current?.playAudioChunk(part.inlineData.data);
                            setIsTalking(true);
                            scheduleTalkingOff(1700);
                        }
                    }
                }

                if (data.serverContent?.turnComplete) {
                    scheduleTalkingOff(500);
                }

                if (data.goAway) {
                    console.warn('Gemini requested disconnect. Reconnecting with session resumption...', data.goAway);
                    ws.close(1012, 'goAway');
                }
            } catch (error) {
                console.error('WS message handling error:', error);
            }
        };

        ws.onerror = (error) => {
            clearSetupTimeout();
            console.error('WS error:', error);
            setConnectionState('error');
        };

        ws.onclose = (event) => {
            clearSetupTimeout();
            audioStreamerRef.current?.stopRecording();
            setIsTalking(false);
            wsRef.current = null;

            if (manualDisconnectRef.current) {
                setConnectionState('disconnected');
                return;
            }

            const canReconnect = allowReconnect
                && shouldReconnect(event.code)
                && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS;

            if (canReconnect) {
                reconnectAttemptRef.current += 1;
                const delay = buildReconnectDelay(reconnectAttemptRef.current);
                setConnectionState('connecting');

                clearReconnectTimer();
                reconnectTimerRef.current = window.setTimeout(() => {
                    reconnectTimerRef.current = null;
                    const reopen = openSocketRef.current;
                    if (!reopen) {
                        setConnectionState('error');
                        return;
                    }

                    void reopen({ allowReconnect: true }).catch((error) => {
                        console.error('Reconnect attempt failed:', error);
                        setConnectionState('error');
                    });
                }, delay);
                return;
            }

            setConnectionState(event.code === 1000 ? 'disconnected' : 'error');
        };
    }, [clearReconnectTimer, clearSetupTimeout, scheduleTalkingOff]);

    useEffect(() => {
        openSocketRef.current = openSocket;
    }, [openSocket]);

    const ensureAudioStreamer = useCallback(() => {
        if (audioStreamerRef.current) return;

        audioStreamerRef.current = new AudioStreamer((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(data);
            }
        });

        void audioStreamerRef.current.primeAudioContext().catch((error) => {
            console.error('Audio context prime error:', error);
        });
    }, []);

    const connect = useCallback(async (initialContext?: string) => {
        if (
            wsRef.current?.readyState === WebSocket.OPEN
            || wsRef.current?.readyState === WebSocket.CONNECTING
        ) {
            return;
        }

        manualDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;
        resumeHandleRef.current = null;
        initialContextRef.current = typeof initialContext === 'string' ? initialContext : '';
        isMicMutedRef.current = false;
        setIsMicMuted(false);

        ensureAudioStreamer();

        try {
            await openSocket({ allowReconnect: true });
        } catch (error) {
            console.error('Failed to establish Gemini Live connection:', error);
            setConnectionState('error');
            throw error;
        }
    }, [ensureAudioStreamer, openSocket]);

    const disconnect = useCallback(() => {
        manualDisconnectRef.current = true;
        clearReconnectTimer();
        clearSetupTimeout();
        clearTalkingTimer();

        wsRef.current?.close(1000, 'Client disconnect');
        wsRef.current = null;

        audioStreamerRef.current?.close().catch((error) => {
            console.error('Failed to close audio streamer:', error);
        });
        audioStreamerRef.current = null;

        resumeHandleRef.current = null;
        reconnectAttemptRef.current = 0;
        isSetupCompleteRef.current = false;
        isMicMutedRef.current = false;

        setIsMicMuted(false);
        setIsTalking(false);
        setConnectionState('disconnected');
    }, [clearReconnectTimer, clearSetupTimeout, clearTalkingTimer]);

    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        connect,
        disconnect,
        connectionState,
        isTalking,
        isMicMuted,
        toggleMic,
    };
}
