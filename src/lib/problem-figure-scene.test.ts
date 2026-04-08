import { describe, expect, it } from 'vitest';

import {
    buildFigureGenerationSourceText,
    compileGeoGebraSceneSpec,
    getDefaultFigureGenerationTarget,
    parseSceneSpecForTarget,
    renderSvgSceneSpec,
    type GeoGebraSceneSpec,
    type SvgSceneSpec,
} from '@/lib/problem-figure-scene';

describe('problem-figure-scene', () => {
    it('問題文の主要テキストから AI 生成用の source text を作る', () => {
        const sourceText = buildFigureGenerationSourceText({
            version: 1,
            title: '二次関数のグラフ',
            summary: '放物線を読み取る',
            instructions: '頂点を答えなさい。',
            blocks: [
                { id: 'b1', type: 'paragraph', text: 'y = x^2 - 4x + 3 のグラフを考える。' },
                { id: 'b2', type: 'katexDisplay', latex: 'y=x^2-4x+3', caption: '式' },
            ],
        });

        expect(sourceText).toContain('二次関数のグラフ');
        expect(sourceText).toContain('頂点を答えなさい');
        expect(sourceText).toContain('y=x^2-4x+3');
    });

    it('GRAPH_DRAW の既定 target は GeoGebra になる', () => {
        expect(getDefaultFigureGenerationTarget('GRAPH_DRAW')).toBe('GEOGEBRA');
        expect(getDefaultFigureGenerationTarget('GEOMETRY')).toBe('GEOGEBRA');
    });

    it('GeoGebra scene spec を graph / geometry 両対応の command stream に変換できる', () => {
        const scene = parseSceneSpecForTarget('GEOGEBRA', {
            kind: 'geogebra',
            viewport: { xmin: -1, xmax: 8, ymin: -1, ymax: 6 },
            objects: [
                { type: 'function', name: 'f', expression: 'x^2-4x+3' },
                { type: 'point', name: 'A', x: 0, y: 0 },
                { type: 'point', name: 'B', x: 6, y: 0 },
                { type: 'point', name: 'C', x: 2, y: 4 },
                { type: 'segment', name: 'sAB', from: 'A', to: 'B' },
                { type: 'polygon', name: 'tri1', points: ['A', 'B', 'C'] },
            ],
            constraints: [
                { type: 'midpoint', name: 'M', of: ['A', 'B'] },
            ],
            labels: [{ target: 'A', text: 'A', visible: true }],
            style: { showGrid: false, showAxes: false },
        }) as GeoGebraSceneSpec;

        const compiled = compileGeoGebraSceneSpec(scene);

        expect(compiled.commands).toContain('f(x)=x^2-4x+3');
        expect(compiled.commands).toContain('A=(0, 0)');
        expect(compiled.commands).toContain('sAB=Segment(A, B)');
        expect(compiled.commands).toContain('M=Midpoint(A, B)');
        expect(compiled.viewport.ymin).toBeLessThan(0);
        expect(compiled.labelOperations).toEqual([
            { target: 'A', text: 'A', visible: true, style: 3 },
        ]);
    });

    it('GeoGebra label の空文字は undefined として扱い、生成エラーにしない', () => {
        const scene = parseSceneSpecForTarget('GEOGEBRA', {
            kind: 'geogebra',
            viewport: { xmin: -5, xmax: 5, ymin: -5, ymax: 5 },
            objects: [
                { type: 'function', name: 'f', expression: 'x^2-4x+3' },
                { type: 'point', name: 'A', x: 0, y: 3 },
            ],
            constraints: [],
            labels: [
                { target: 'A', text: '', visible: true },
                { target: 'f', text: '   ', visible: false },
            ],
            style: { showGrid: true, showAxes: true },
        }) as GeoGebraSceneSpec;

        const compiled = compileGeoGebraSceneSpec(scene);

        expect(compiled.labelOperations).toEqual([
            { target: 'A', text: undefined, visible: true, style: 0 },
            { target: 'f', text: undefined, visible: false, style: 0 },
        ]);
    });

    it('SVG scene spec を印刷向け SVG に変換できる', () => {
        const scene = parseSceneSpecForTarget('SVG', {
            kind: 'svg',
            width: 640,
            height: 480,
            background: '#ffffff',
            caption: '三角形ABC',
            elements: [
                { type: 'line', x1: 80, y1: 380, x2: 320, y2: 80 },
                { type: 'line', x1: 320, y1: 80, x2: 560, y2: 380 },
                { type: 'line', x1: 560, y1: 380, x2: 80, y2: 380 },
            ],
            labels: [
                { x: 70, y: 400, text: 'A' },
                { x: 320, y: 60, text: 'B' },
                { x: 570, y: 400, text: 'C' },
            ],
        }) as SvgSceneSpec;

        const svg = renderSvgSceneSpec(scene);

        expect(svg).toContain('<svg');
        expect(svg).toContain('三角形ABC');
        expect(svg).toContain('A');
        expect(svg).toContain('line');
    });
});
