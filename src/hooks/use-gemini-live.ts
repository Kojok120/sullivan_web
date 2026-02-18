import { useRef, useState, useCallback, useEffect } from 'react';
import { AudioStreamer } from '@/lib/audio-streamer';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
const CONNECTION_SETUP_TIMEOUT_MS = 10000;

type GeminiLiveMessage = {
    setupComplete?: unknown;
    goAway?: unknown;
    serverContent?: {
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

export function useGeminiLive() {
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [isTalking, setIsTalking] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const audioStreamerRef = useRef<AudioStreamer | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const isMicMutedRef = useRef(false);

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
            connectionState !== 'connected' ||
            wsRef.current?.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        try {
            await audioStreamer.startRecording();
        } catch (error) {
            console.error("Microphone resume failed:", error);
            setConnectionState('error');
        }
    }, [connectionState]);

    const toggleMic = useCallback(() => {
        void setMicMuted(!isMicMutedRef.current);
    }, [setMicMuted]);

    const connect = useCallback((initialContext?: string) => {
        if (
            wsRef.current?.readyState === WebSocket.OPEN ||
            wsRef.current?.readyState === WebSocket.CONNECTING
        ) {
            return;
        }

        isMicMutedRef.current = false;
        setIsMicMuted(false);
        setConnectionState('connecting');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        audioStreamerRef.current = new AudioStreamer((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });
        void audioStreamerRef.current.primeAudioContext().catch((error) => {
            console.error("Audio context prime error:", error);
        });

        let isSetupComplete = false;
        let initialContextSent = false;
        const setupTimeoutId = window.setTimeout(() => {
            if (isSetupComplete) return;
            if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                console.error(`WS setup timeout (${CONNECTION_SETUP_TIMEOUT_MS}ms)`);
                setConnectionState('error');
                ws.close();
            }
        }, CONNECTION_SETUP_TIMEOUT_MS);

        const sendInitialContextIfNeeded = () => {
            if (!initialContext || initialContextSent || ws.readyState !== WebSocket.OPEN) return;

            const message = {
                clientContent: {
                    turns: [
                        {
                            role: "user",
                            parts: [{ text: initialContext }]
                        }
                    ],
                    turnComplete: true
                }
            };
            ws.send(JSON.stringify(message));
            initialContextSent = true;
        };

        ws.onopen = () => {
            console.log('WS Connected to proxy');
        };

        ws.onmessage = async (event) => {
            try {
                const text = typeof event.data === 'string'
                    ? event.data
                    : await (new Response(event.data)).text();

                const data = parseGeminiLiveMessage(text);
                if (!data) return;

                if (data.setupComplete !== undefined && !isSetupComplete) {
                    isSetupComplete = true;
                    window.clearTimeout(setupTimeoutId);
                    sendInitialContextIfNeeded();
                    if (!isMicMutedRef.current) {
                        try {
                            await audioStreamerRef.current?.startRecording();
                        } catch (error) {
                            console.error("Microphone start failed:", error);
                            setConnectionState('error');
                            return;
                        }
                    }
                    setConnectionState('connected');
                }

                if (data.serverContent?.modelTurn?.parts) {
                    for (const part of data.serverContent.modelTurn.parts) {
                        if (
                            part.inlineData?.mimeType?.startsWith('audio/pcm')
                            && typeof part.inlineData.data === 'string'
                        ) {
                            audioStreamerRef.current?.playAudioChunk(part.inlineData.data);
                            setIsTalking(true);
                            setTimeout(() => setIsTalking(false), 2000);
                        }
                    }
                }

                if (data.goAway) {
                    console.warn('Gemini requested disconnect:', data.goAway);
                    ws.close();
                }
            } catch (error) {
                console.error("WS Message Error:", error);
            }
        };

        ws.onerror = (error) => {
            window.clearTimeout(setupTimeoutId);
            console.error("WS Error:", error);
            setConnectionState('error');
        };

        ws.onclose = () => {
            window.clearTimeout(setupTimeoutId);
            console.log("WS Closed");
            setConnectionState('disconnected');
            setIsTalking(false);
            isMicMutedRef.current = false;
            setIsMicMuted(false);
            audioStreamerRef.current?.close();
            wsRef.current = null;
        };

    }, []);

    const disconnect = useCallback(() => {
        wsRef.current?.close();
        audioStreamerRef.current?.close();
        wsRef.current = null;
        setConnectionState('disconnected');
        setIsTalking(false);
        isMicMutedRef.current = false;
        setIsMicMuted(false);
    }, []);

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
        toggleMic
    };
}
