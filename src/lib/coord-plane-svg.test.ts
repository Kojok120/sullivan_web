import { describe, expect, it } from 'vitest';

import {
    expandCoordPlaneDirectives,
    expandCoordPlaneDirectivesAsText,
    parseCoordPlaneDirective,
    renderCoordPlaneSvg,
} from './coord-plane-svg';

describe('parseCoordPlaneDirective', () => {
    it('xmin/xmax/ymin/ymax だけで最小構成をパースできる', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5');
        expect(opts).toEqual({
            xmin: -5, xmax: 5, ymin: -5, ymax: 5,
            points: [], curves: [], lines: [],
        });
    });

    it('points 属性をラベル付きでパースできる', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5 points="P:4,3;Q:-2,1;0,0"');
        expect(opts?.points).toEqual([
            { label: 'P', x: 4, y: 3 },
            { label: 'Q', x: -2, y: 1 },
            { label: '', x: 0, y: 0 },
        ]);
    });

    it('lines は x= / y= のみ受け付ける', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5 lines="x=2;y=-1;z=3"');
        expect(opts?.lines).toEqual([
            { axis: 'x', value: 2 },
            { axis: 'y', value: -1 },
        ]);
    });

    it('curves は y=式 のみ受け付け、コンパイル失敗は除外する', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5 curves="y=x^2;y=6/x;y=@@@"');
        expect(opts?.curves).toHaveLength(2);
        expect(opts?.curves[0].evaluator(2)).toBe(4);
        expect(opts?.curves[1].evaluator(3)).toBe(2);
    });

    it('範囲が不正なら null を返す', () => {
        expect(parseCoordPlaneDirective('xmin=5 xmax=-5 ymin=-5 ymax=5')).toBeNull();
        expect(parseCoordPlaneDirective('xmin=0 xmax=5 ymin=5 ymax=5')).toBeNull();
    });

    it('必須属性が欠けていれば null を返す', () => {
        expect(parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5')).toBeNull();
    });
});

describe('curve evaluator', () => {
    it('四則演算と単項マイナスを評価できる', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5 curves="y=2*x+1;y=-x;y=(x+1)/2"');
        expect(opts?.curves[0].evaluator(3)).toBe(7);
        expect(opts?.curves[1].evaluator(3)).toBe(-3);
        expect(opts?.curves[2].evaluator(5)).toBe(3);
    });

    it('累乗と sqrt を評価できる', () => {
        const opts = parseCoordPlaneDirective('xmin=0 xmax=10 ymin=-5 ymax=5 curves="y=x^2;y=sqrt(x)"');
        expect(opts?.curves[0].evaluator(4)).toBe(16);
        expect(opts?.curves[1].evaluator(9)).toBe(3);
    });

    it('0 除算は NaN を返す', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5 curves="y=6/x"');
        expect(Number.isNaN(opts!.curves[0].evaluator(0))).toBe(true);
    });

    it('単項マイナスは累乗より外側に適用される（-x^2 = -(x^2)）', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-30 ymax=5 curves="y=-x^2"');
        expect(opts?.curves[0].evaluator(3)).toBe(-9);
        expect(opts?.curves[0].evaluator(-3)).toBe(-9);
    });

    it('指数側にも単項マイナスを書ける（2^-3 = 0.125）', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=-5 ymax=5 curves="y=2^-3"');
        expect(opts?.curves[0].evaluator(0)).toBeCloseTo(0.125, 6);
    });

    it('累乗は右結合（2^3^2 = 2^(3^2) = 512）', () => {
        const opts = parseCoordPlaneDirective('xmin=-5 xmax=5 ymin=0 ymax=600 curves="y=2^3^2"');
        expect(opts?.curves[0].evaluator(0)).toBe(512);
    });
});

describe('renderCoordPlaneSvg', () => {
    it('最小構成で svg 要素を返す', () => {
        const svg = renderCoordPlaneSvg({
            xmin: -5, xmax: 5, ymin: -5, ymax: 5,
            points: [], curves: [], lines: [],
        });
        expect(svg).toContain('<svg class="coordplane"');
        expect(svg).toContain('viewBox="0 0 360 360"');
    });

    it('範囲が不正ならエラー span を返す', () => {
        const svg = renderCoordPlaneSvg({
            xmin: 5, xmax: -5, ymin: -5, ymax: 5,
            points: [], curves: [], lines: [],
        });
        expect(svg).toContain('coordplane-error');
    });

    it('小さい span（[-0.5, 0.5]）でも fractional な目盛が描画される', () => {
        const svg = renderCoordPlaneSvg({
            xmin: -0.5, xmax: 0.5, ymin: -0.5, ymax: 0.5,
            points: [], curves: [], lines: [],
        });
        // step=0.1 を選択するので 0.1, 0.2, ... 0.5 が目盛りラベルとして含まれる
        expect(svg).toContain('>0.1<');
        expect(svg).toContain('>0.5<');
    });

    it('同一内容を 2 回描画しても idSuffix で marker id が衝突しない', () => {
        const opts = {
            xmin: -5, xmax: 5, ymin: -5, ymax: 5,
            points: [], curves: [], lines: [],
        };
        const a = renderCoordPlaneSvg(opts, 'a');
        const b = renderCoordPlaneSvg(opts, 'b');
        // それぞれの marker id を取り出して一致しないことを確認
        const idA = a.match(/cp-([a-z0-9]+)-up/)?.[1];
        const idB = b.match(/cp-([a-z0-9]+)-up/)?.[1];
        expect(idA).toBeTruthy();
        expect(idB).toBeTruthy();
        expect(idA).not.toBe(idB);
    });

    it('points のラベルは XML エスケープされる', () => {
        const svg = renderCoordPlaneSvg({
            xmin: -5, xmax: 5, ymin: -5, ymax: 5,
            points: [{ label: 'A<B', x: 1, y: 1 }],
            curves: [], lines: [],
        });
        expect(svg).toContain('A&lt;B');
    });
});

describe('expandCoordPlaneDirectives', () => {
    it('テキスト中の [[coordplane ...]] を SVG に置換する', () => {
        const out = expandCoordPlaneDirectives('図: [[coordplane xmin=-5 xmax=5 ymin=-5 ymax=5 points="P:1,2"]] を見よ');
        expect(out).toContain('<svg class="coordplane"');
        expect(out).toContain('図: ');
        expect(out).toContain(' を見よ');
    });

    it('パース失敗ならテキストはそのまま', () => {
        const text = '不正: [[coordplane xmin=5 xmax=-5 ymin=-5 ymax=5]]';
        expect(expandCoordPlaneDirectives(text)).toBe(text);
    });
});

describe('expandCoordPlaneDirectivesAsText', () => {
    it('座標平面ディレクティブを日本語サマリに展開する', () => {
        const out = expandCoordPlaneDirectivesAsText('図: [[coordplane xmin=-5 xmax=5 ymin=-5 ymax=5 points="P:1,2;Q:-3,0" curves="y=x^2" lines="x=2"]]');
        expect(out).toContain('座標平面');
        expect(out).toContain('P(1, 2)');
        expect(out).toContain('Q(-3, 0)');
        expect(out).toContain('y=x^2');
        expect(out).toContain('x=2');
        expect(out).not.toContain('<svg');
    });

    it('パース失敗時は元のテキストを残す', () => {
        const text = '不正: [[coordplane xmin=5 xmax=-5 ymin=-5 ymax=5]]';
        expect(expandCoordPlaneDirectivesAsText(text)).toBe(text);
    });
});
