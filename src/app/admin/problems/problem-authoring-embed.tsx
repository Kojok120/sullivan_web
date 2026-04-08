'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    compileDesmosSceneSpec,
    compileGeoGebraSceneSpec,
    type DesmosSceneSpec,
    type GeoGebraSceneSpec,
} from '@/lib/problem-figure-scene';
import { ensureRenderableSvgMarkup, normalizeSvgExport } from '@/lib/problem-svg';

type DesmosCalculator = {
    getState: () => unknown;
    setState: (state: unknown) => void;
    observeEvent?: (eventName: string, callback: () => void) => void;
    unobserveEvent?: (eventName: string, callback: () => void) => void;
    asyncScreenshot: (
        options: Record<string, unknown>,
        callback: (data: string) => void,
    ) => void;
    destroy?: () => void;
};

type DesmosApi = {
    GraphingCalculator: (
        element: HTMLElement,
        options?: Record<string, unknown>,
    ) => DesmosCalculator;
};

type GeoGebraApi = {
    getBase64: (callback?: (base64: string) => void) => string | void;
    setBase64: (base64: string, callback?: () => void) => void;
    exportSVG: (callback: (svg: string) => void) => void;
    evalCommand?: (command: string) => boolean | void;
    getAllObjectNames?: () => string[] | string;
    deleteObject?: (name: string) => void;
    setCoordSystem?: (xmin: number, xmax: number, ymin: number, ymax: number) => void;
    setGridVisible?: (visible: boolean) => void;
    setAxesVisible?: (xVisible: boolean, yVisible: boolean) => void;
    setCaption?: (name: string, caption: string) => void;
    setLabelVisible?: (name: string, visible: boolean) => void;
    setLabelStyle?: (name: string, style: number) => void;
    registerClientListener?: (callback: (event: unknown) => void) => void;
    unregisterClientListener?: (callback: (event: unknown) => void) => void;
    remove?: () => void;
};

type GGBAppletInstance = {
    inject: (target: HTMLElement | string) => void;
    remove?: () => void;
};

type GGBAppletConstructor = new (
    options: Record<string, unknown>,
    startAnimation?: boolean,
) => GGBAppletInstance;

declare global {
    interface Window {
        Desmos?: DesmosApi;
        GGBApplet?: GGBAppletConstructor;
    }
}

export type VendorSyncPayload = {
    authoringState: unknown;
    svgContent?: string;
};

export type VendorSceneApplyPayload =
    | { tool: 'DESMOS'; sceneSpec: DesmosSceneSpec }
    | { tool: 'GEOGEBRA'; sceneSpec: GeoGebraSceneSpec };

type ProblemAuthoringEmbedProps = {
    problemType: string;
    tool: 'DESMOS' | 'GEOGEBRA';
    authoringStateText: string;
    onAuthoringStateTextChange: (next: string) => void;
    syncHandlerRef: MutableRefObject<(() => Promise<VendorSyncPayload>) | null>;
    sceneApplyHandlerRef: MutableRefObject<((payload: VendorSceneApplyPayload) => Promise<void>) | null>;
    disabled?: boolean;
    onReadyStateChange?: (ready: boolean) => void;
};

function safeParseJson(value: string) {
    try {
        return JSON.parse(value) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function normalizeGeoGebraObjectNames(raw: string[] | string | undefined) {
    if (Array.isArray(raw)) {
        return raw.map((name) => String(name).trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        return raw.split(',').map((name) => name.trim()).filter(Boolean);
    }
    return [];
}

export function ProblemAuthoringEmbed({
    problemType,
    tool,
    authoringStateText,
    onAuthoringStateTextChange,
    syncHandlerRef,
    sceneApplyHandlerRef,
    disabled = false,
    onReadyStateChange,
}: ProblemAuthoringEmbedProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const desmosRef = useRef<DesmosCalculator | null>(null);
    const geoGebraRef = useRef<GeoGebraApi | null>(null);
    const geoGebraAppletRef = useRef<GGBAppletInstance | null>(null);
    const geoGebraListenerRef = useRef<((event: unknown) => void) | null>(null);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const appliedStateRef = useRef('');
    const authoringStateTextRef = useRef(authoringStateText);
    const queueStateSyncRef = useRef<(producer: () => unknown | Promise<unknown>) => Promise<void>>(async () => {});
    const desmosApiKey = (process.env.NEXT_PUBLIC_DESMOS_API_KEY || '').trim();
    const [desmosScriptReady, setDesmosScriptReady] = useState(false);
    const [geoGebraScriptReady, setGeoGebraScriptReady] = useState(false);
    const [statusText, setStatusText] = useState('読み込み待ち');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const geoGebraAppName = problemType === 'GRAPH_DRAW' ? 'graphing' : 'geometry';

    const pushStateText = useCallback((nextState: unknown) => {
        const serialized = JSON.stringify(nextState, null, 2);
        appliedStateRef.current = serialized;
        onAuthoringStateTextChange(serialized);
        setStatusText('state を同期しました');
        return serialized;
    }, [onAuthoringStateTextChange]);

    const queueStateSync = async (producer: () => unknown | Promise<unknown>) => {
        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }

        syncTimeoutRef.current = setTimeout(async () => {
            try {
                const nextState = await producer();
                pushStateText(nextState);
            } catch (error) {
                console.error('[problem-authoring-embed] state 同期に失敗しました', error);
                setStatusText('state 同期に失敗しました');
            }
        }, 300);
    };

    authoringStateTextRef.current = authoringStateText;
    queueStateSyncRef.current = queueStateSync;

    const captureDesmosPayload = useCallback(async (): Promise<VendorSyncPayload> => {
        if (!desmosApiKey) {
            throw new Error('NEXT_PUBLIC_DESMOS_API_KEY が未設定です');
        }

        const calculator = desmosRef.current;
        if (!calculator) {
            throw new Error('Desmos エディタがまだ準備できていません');
        }

        const authoringState = calculator.getState();
        const svgContent = ensureRenderableSvgMarkup(
            await new Promise<string>((resolve, reject) => {
                try {
                    calculator.asyncScreenshot(
                        {
                            format: 'svg',
                            width: 1280,
                            height: 960,
                            showLabels: true,
                        },
                        (data) => resolve(data),
                    );
                } catch (error) {
                    reject(error);
                }
            }),
        );

        pushStateText(authoringState);
        return {
            authoringState,
            svgContent,
        };
    }, [desmosApiKey, pushStateText]);

    const captureGeoGebraPayload = useCallback(async (): Promise<VendorSyncPayload> => {
        const api = geoGebraRef.current;
        if (!api) {
            throw new Error('GeoGebra エディタがまだ準備できていません');
        }

        const base64 = await new Promise<string>((resolve, reject) => {
            try {
                const maybeValue = api.getBase64((value) => resolve(value));
                if (typeof maybeValue === 'string' && maybeValue.length > 0) {
                    resolve(maybeValue);
                }
            } catch (error) {
                reject(error);
            }
        });

        const svgContent = ensureRenderableSvgMarkup(
            normalizeSvgExport(await new Promise<string>((resolve, reject) => {
                try {
                    api.exportSVG((value) => resolve(value));
                } catch (error) {
                    reject(error);
                }
            })),
        );

        const authoringState = { base64 };
        pushStateText(authoringState);
        return {
            authoringState,
            svgContent,
        };
    }, [pushStateText]);

    const applyDesmosScene = useCallback(async (sceneSpec: DesmosSceneSpec) => {
        if (!desmosApiKey) {
            throw new Error('NEXT_PUBLIC_DESMOS_API_KEY が未設定です');
        }

        const calculator = desmosRef.current;
        if (!calculator) {
            throw new Error('Desmos エディタがまだ準備できていません');
        }

        const compiled = compileDesmosSceneSpec(sceneSpec);
        calculator.setState(compiled.state);
        pushStateText(compiled.state);
        setStatusText('AI生成結果を Desmos に反映しました');
        await new Promise((resolve) => setTimeout(resolve, 150));
    }, [desmosApiKey, pushStateText]);

    const applyGeoGebraScene = useCallback(async (sceneSpec: GeoGebraSceneSpec) => {
        const api = geoGebraRef.current;
        if (!api) {
            throw new Error('GeoGebra エディタがまだ準備できていません');
        }

        const compiled = compileGeoGebraSceneSpec(sceneSpec);
        const existingObjectNames = normalizeGeoGebraObjectNames(api.getAllObjectNames?.());
        for (const name of existingObjectNames.reverse()) {
            api.deleteObject?.(name);
        }

        for (const command of compiled.commands) {
            const result = api.evalCommand?.(command);
            if (result === false) {
                throw new Error(`GeoGebra command の適用に失敗しました: ${command}`);
            }
        }

        for (const label of compiled.labelOperations) {
            try {
                if (label.text) {
                    api.setCaption?.(label.target, label.text);
                    api.setLabelStyle?.(label.target, label.style);
                } else {
                    api.setLabelStyle?.(label.target, 0);
                }
                api.setLabelVisible?.(label.target, label.visible);
            } catch (error) {
                console.error('[problem-authoring-embed] GeoGebra label operation に失敗しました', {
                    label,
                    error,
                });
                throw new Error(`GeoGebra のラベル設定に失敗しました: ${label.target}`);
            }
        }

        api.setCoordSystem?.(
            compiled.viewport.xmin,
            compiled.viewport.xmax,
            compiled.viewport.ymin,
            compiled.viewport.ymax,
        );
        api.setGridVisible?.(compiled.style.showGrid);
        api.setAxesVisible?.(compiled.style.showAxes, compiled.style.showAxes);
        setStatusText('AI生成結果を GeoGebra に反映しました');
        await new Promise((resolve) => setTimeout(resolve, 200));
    }, []);

    useEffect(() => {
        onReadyStateChange?.(isReady);

        if (!isReady) {
            syncHandlerRef.current = null;
            sceneApplyHandlerRef.current = null;

            return () => {
                syncHandlerRef.current = null;
                sceneApplyHandlerRef.current = null;
                onReadyStateChange?.(false);
            };
        }

        syncHandlerRef.current = tool === 'DESMOS'
            ? captureDesmosPayload
            : captureGeoGebraPayload;

        sceneApplyHandlerRef.current = async (payload) => {
            if (payload.tool === 'DESMOS') {
                await applyDesmosScene(payload.sceneSpec);
                return;
            }
            await applyGeoGebraScene(payload.sceneSpec);
        };

        return () => {
            syncHandlerRef.current = null;
            sceneApplyHandlerRef.current = null;
            onReadyStateChange?.(false);
        };
    }, [
        applyDesmosScene,
        applyGeoGebraScene,
        captureDesmosPayload,
        captureGeoGebraPayload,
        isReady,
        onReadyStateChange,
        sceneApplyHandlerRef,
        syncHandlerRef,
        tool,
    ]);

    useEffect(() => {
        setIsReady(false);
    }, [tool]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (window.Desmos && !desmosScriptReady) {
            setDesmosScriptReady(true);
        }

        if (window.GGBApplet && !geoGebraScriptReady) {
            setGeoGebraScriptReady(true);
        }
    }, [desmosScriptReady, geoGebraScriptReady, tool]);

    useEffect(() => {
        if (tool !== 'DESMOS') return;
        if (!desmosApiKey) {
            setStatusText('NEXT_PUBLIC_DESMOS_API_KEY が未設定です');
            return;
        }
        if (!desmosScriptReady) {
            setStatusText('Desmos の読み込みを待っています');
            return;
        }
        if (!desmosScriptReady) return;
        if (!containerRef.current) return;
        if (desmosRef.current) return;
        if (!window.Desmos) return;

        const container = containerRef.current;
        const calculator = window.Desmos.GraphingCalculator(container, {
            expressions: true,
            settingsMenu: true,
            zoomButtons: true,
            keypad: true,
        });
        desmosRef.current = calculator;
        setIsReady(true);
        setStatusText('Desmos エディタを初期化しました');

        const initialState = safeParseJson(authoringStateTextRef.current);
        if (initialState) {
            try {
                calculator.setState(initialState);
                appliedStateRef.current = authoringStateTextRef.current;
            } catch (error) {
                console.error('[problem-authoring-embed] Desmos state 復元に失敗しました', error);
            }
        }

        const handleChange = () => {
            void queueStateSyncRef.current(() => calculator.getState());
        };
        calculator.observeEvent?.('change', handleChange);

        return () => {
            calculator.unobserveEvent?.('change', handleChange);
            calculator.destroy?.();
            desmosRef.current = null;
            setIsReady(false);
            container.innerHTML = '';
        };
    }, [desmosApiKey, desmosScriptReady, tool]);

    useEffect(() => {
        if (tool !== 'DESMOS') return;
        if (!desmosRef.current) return;
        if (!authoringStateText.trim()) return;
        if (authoringStateText === appliedStateRef.current) return;

        const parsed = safeParseJson(authoringStateText);
        if (!parsed) return;

        try {
            desmosRef.current.setState(parsed);
            appliedStateRef.current = authoringStateText;
        } catch (error) {
            console.error('[problem-authoring-embed] Desmos state 適用に失敗しました', error);
        }
    }, [authoringStateText, tool]);

    useEffect(() => {
        if (tool !== 'GEOGEBRA') return;
        if (!geoGebraScriptReady) {
            setStatusText('GeoGebra の読み込みを待っています');
            return;
        }
        if (!geoGebraScriptReady) return;
        if (!containerRef.current) return;
        if (geoGebraAppletRef.current) return;
        if (!window.GGBApplet) return;

        const container = containerRef.current;
        const applet = new window.GGBApplet({
            appName: geoGebraAppName,
            width: '100%',
            height: 520,
            showToolBar: true,
            showAlgebraInput: true,
            showMenuBar: false,
            enableShiftDragZoom: true,
            appletOnLoad: (api: GeoGebraApi) => {
                geoGebraRef.current = api;
                setIsReady(true);
                setStatusText('GeoGebra エディタを初期化しました');

                const initialState = safeParseJson(authoringStateTextRef.current);
                const base64 = typeof initialState?.base64 === 'string' ? initialState.base64 : '';
                if (base64) {
                    try {
                        api.setBase64(base64, () => {
                            appliedStateRef.current = authoringStateTextRef.current;
                        });
                    } catch (error) {
                        console.error('[problem-authoring-embed] GeoGebra state 復元に失敗しました', error);
                    }
                }

                const listener = () => {
                    void queueStateSyncRef.current(async () => {
                        const currentBase64 = await new Promise<string>((resolve, reject) => {
                            try {
                                const maybeValue = api.getBase64((value) => resolve(value));
                                if (typeof maybeValue === 'string' && maybeValue.length > 0) {
                                    resolve(maybeValue);
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });
                        return { base64: currentBase64 };
                    });
                };

                geoGebraListenerRef.current = listener;
                api.registerClientListener?.(listener);
            },
        }, true);

        container.innerHTML = '';
        applet.inject(container);
        geoGebraAppletRef.current = applet;

        return () => {
            if (geoGebraListenerRef.current) {
                geoGebraRef.current?.unregisterClientListener?.(geoGebraListenerRef.current);
            }
            geoGebraRef.current?.remove?.();
            geoGebraAppletRef.current?.remove?.();
            geoGebraRef.current = null;
            geoGebraAppletRef.current = null;
            geoGebraListenerRef.current = null;
            setIsReady(false);
            container.innerHTML = '';
        };
    }, [geoGebraAppName, geoGebraScriptReady, tool]);

    useEffect(() => {
        if (tool !== 'GEOGEBRA') return;
        if (!geoGebraRef.current) return;
        if (!authoringStateText.trim()) return;
        if (authoringStateText === appliedStateRef.current) return;

        const parsed = safeParseJson(authoringStateText);
        const base64 = typeof parsed?.base64 === 'string' ? parsed.base64 : '';
        if (!base64) return;

        try {
            geoGebraRef.current.setBase64(base64, () => {
                appliedStateRef.current = authoringStateText;
            });
        } catch (error) {
            console.error('[problem-authoring-embed] GeoGebra state 適用に失敗しました', error);
        }
    }, [authoringStateText, tool]);

    useEffect(() => {
        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, []);

    const handleManualStateSync = async () => {
        setIsSyncing(true);
        try {
            if (tool === 'DESMOS') {
                await captureDesmosPayload();
            } else {
                await captureGeoGebraPayload();
            }
            toast.success('作問 state を同期しました');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'state 同期に失敗しました');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSvgExportTest = async () => {
        setIsSyncing(true);
        try {
            const payload = tool === 'DESMOS'
                ? await captureDesmosPayload()
                : await captureGeoGebraPayload();
            if (!payload.svgContent?.trim()) {
                throw new Error('SVG 書き出し結果が空です');
            }
            toast.success(`SVG を生成しました (${payload.svgContent.length.toLocaleString()} chars)`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'SVG 書き出しに失敗しました');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-3">
            {tool === 'DESMOS' && desmosApiKey && (
                <Script
                    src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(desmosApiKey)}`}
                    strategy="afterInteractive"
                    onLoad={() => setDesmosScriptReady(true)}
                />
            )}
            {tool === 'GEOGEBRA' && (
                <Script
                    src="https://www.geogebra.org/apps/deployggb.js"
                    strategy="afterInteractive"
                    onLoad={() => setGeoGebraScriptReady(true)}
                />
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={handleManualStateSync} disabled={disabled || isSyncing}>
                    state を再同期
                </Button>
                <Button type="button" variant="outline" onClick={handleSvgExportTest} disabled={disabled || isSyncing}>
                    SVG 書き出しテスト
                </Button>
                <div className="text-xs text-muted-foreground">
                    {statusText}
                </div>
            </div>

            <div
                ref={containerRef}
                className="h-[520px] w-full overflow-hidden rounded-lg border bg-white"
            />

            <p className="text-xs text-muted-foreground">
                保存時に {tool} の native state と SVG export を自動で回収し、Sullivan 側へ保存します。
            </p>
            {tool === 'DESMOS' && !desmosApiKey && (
                <p className="text-xs text-amber-700">
                    Desmos を有効にするには `.env.local` または `.env.DEV` に `NEXT_PUBLIC_DESMOS_API_KEY` を設定してください。
                </p>
            )}
        </div>
    );
}
