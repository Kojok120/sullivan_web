import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemAuthoringEmbed, type VendorSyncPayload } from './problem-authoring-embed';

vi.mock('next/script', async () => {
    const ReactModule = await import('react');

    return {
        default: function MockScript({ onLoad }: { onLoad?: () => void }) {
            ReactModule.useEffect(() => {
                onLoad?.();
            }, [onLoad]);

            return null;
        },
    };
});

type MockGeoGebraApi = {
    showAllObjects: ReturnType<typeof vi.fn>;
    getBase64: (callback?: (base64: string) => void) => string;
    getViewProperties: ReturnType<typeof vi.fn>;
    exportSVG: (callback: (svg: string) => void) => void;
    registerClientListener: ReturnType<typeof vi.fn>;
    unregisterClientListener: ReturnType<typeof vi.fn>;
    setCoordSystem: ReturnType<typeof vi.fn>;
    setGridVisible: ReturnType<typeof vi.fn>;
    setAxesVisible: ReturnType<typeof vi.fn>;
    evalCommand: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
};

let latestGeoGebraApi: MockGeoGebraApi | null = null;

function createGeoGebraApi(): MockGeoGebraApi {
    return {
        showAllObjects: vi.fn(),
        getBase64: (callback?: (base64: string) => void) => {
            callback?.('mock-base64');
            return 'mock-base64';
        },
        getViewProperties: vi.fn(() => ({
            xMin: -6,
            yMin: -2,
            width: 12,
            height: 8,
            invXscale: 1,
            invYscale: 1,
        })),
        exportSVG: (callback: (svg: string) => void) => {
            callback('<svg width="320" height="240"></svg>');
        },
        registerClientListener: vi.fn(),
        unregisterClientListener: vi.fn(),
        setCoordSystem: vi.fn(),
        setGridVisible: vi.fn(),
        setAxesVisible: vi.fn(),
        evalCommand: vi.fn(),
        remove: vi.fn(),
    };
}

class MockGGBApplet {
    constructor(private readonly options: Record<string, unknown>) {}

    inject() {
        latestGeoGebraApi = createGeoGebraApi();
        const appletOnLoad = this.options.appletOnLoad as ((api: MockGeoGebraApi) => void) | undefined;
        appletOnLoad?.(latestGeoGebraApi);
    }

    remove() {}
}

describe('ProblemAuthoringEmbed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        latestGeoGebraApi = null;
        window.GGBApplet = MockGGBApplet as never;
        delete window.Desmos;
    });

    it('手動操作ボタンを表示しない', async () => {
        render(
            <ProblemAuthoringEmbed
                problemType="GRAPH_DRAW"
                tool="GEOGEBRA"
                authoringStateText=""
                onAuthoringStateTextChange={vi.fn()}
                syncHandlerRef={{ current: null }}
                sceneApplyHandlerRef={{ current: null }}
            />,
        );

        await waitFor(() => expect(latestGeoGebraApi).not.toBeNull());
        expect(screen.queryByRole('button', { name: 'state を再同期' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '全体表示に合わせる' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'SVG 書き出しテスト' })).not.toBeInTheDocument();
    });

    it('GeoGebra 準備完了後に sync/apply handler を登録する', async () => {
        const syncHandlerRef = { current: null as null | (() => Promise<VendorSyncPayload>) };
        const sceneApplyHandlerRef = { current: null as null | ((payload: unknown) => Promise<void>) };

        render(
            <ProblemAuthoringEmbed
                problemType="GRAPH_DRAW"
                tool="GEOGEBRA"
                authoringStateText=""
                onAuthoringStateTextChange={vi.fn()}
                syncHandlerRef={syncHandlerRef}
                sceneApplyHandlerRef={sceneApplyHandlerRef}
            />,
        );

        await waitFor(() => {
            expect(syncHandlerRef.current).toBeTypeOf('function');
            expect(sceneApplyHandlerRef.current).toBeTypeOf('function');
        });
    });

    it('AI 適用時は内部的に showAllObjects を呼ぶ', async () => {
        const sceneApplyHandlerRef = { current: null as null | ((payload: unknown) => Promise<void>) };

        render(
            <ProblemAuthoringEmbed
                problemType="GRAPH_DRAW"
                tool="GEOGEBRA"
                authoringStateText=""
                onAuthoringStateTextChange={vi.fn()}
                syncHandlerRef={{ current: null }}
                sceneApplyHandlerRef={sceneApplyHandlerRef}
            />,
        );

        await waitFor(() => expect(sceneApplyHandlerRef.current).toBeTypeOf('function'));

        await act(async () => {
            await sceneApplyHandlerRef.current?.({
                tool: 'GEOGEBRA',
                sceneSpec: {
                    kind: 'geogebra',
                    viewport: { xmin: -1, xmax: 4, ymin: -2, ymax: 5 },
                    objects: [{ type: 'function', name: 'f', expression: 'x^2-4x+3' }],
                    constraints: [],
                    labels: [],
                    style: { showGrid: true, showAxes: true },
                },
            });
        });

        expect(latestGeoGebraApi?.showAllObjects).toHaveBeenCalledTimes(1);
    });

    it('同期時は現在の GeoGebra ビューポートを固定してから export する', async () => {
        const syncHandlerRef = { current: null as null | (() => Promise<VendorSyncPayload>) };

        render(
            <ProblemAuthoringEmbed
                problemType="GRAPH_DRAW"
                tool="GEOGEBRA"
                authoringStateText=""
                onAuthoringStateTextChange={vi.fn()}
                syncHandlerRef={syncHandlerRef}
                sceneApplyHandlerRef={{ current: null }}
            />,
        );

        await waitFor(() => expect(syncHandlerRef.current).toBeTypeOf('function'));

        await act(async () => {
            await syncHandlerRef.current?.();
        });

        expect(latestGeoGebraApi?.getViewProperties).toHaveBeenCalledWith(1);
        expect(latestGeoGebraApi?.evalCommand).toHaveBeenCalledWith('SetActiveView(1)');
        expect(latestGeoGebraApi?.setCoordSystem).toHaveBeenCalledWith(-6, 6, -2, 6);
    });
});
