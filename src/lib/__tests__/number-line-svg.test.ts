import { describe, expect, it } from 'vitest';

import {
    expandNumberLineDirectives,
    parseNumberLineDirective,
    renderNumberLineSvg,
} from '../number-line-svg';

describe('parseNumberLineDirective', () => {
    it('基本的な属性をパースする', () => {
        const result = parseNumberLineDirective('min=-5 max=5 marks="A:-3,B:2"');
        expect(result).toEqual({
            min: -5,
            max: 5,
            marks: [
                { label: 'A', value: -3 },
                { label: 'B', value: 2 },
            ],
        });
    });

    it('marks が無くてもパースできる', () => {
        const result = parseNumberLineDirective('min=0 max=10');
        expect(result).toEqual({ min: 0, max: 10, marks: [] });
    });

    it('小数の min/max と mark を扱える', () => {
        const result = parseNumberLineDirective('min=-1.5 max=2.5 marks="P:0.5"');
        expect(result).toEqual({
            min: -1.5,
            max: 2.5,
            marks: [{ label: 'P', value: 0.5 }],
        });
    });

    it('label を省略した mark は label="" として返す', () => {
        const result = parseNumberLineDirective('min=0 max=5 marks="3"');
        expect(result?.marks).toEqual([{ label: '', value: 3 }]);
    });

    it('min または max が無ければ null', () => {
        expect(parseNumberLineDirective('max=5')).toBeNull();
        expect(parseNumberLineDirective('min=0')).toBeNull();
    });

    it('数値にならない min/max は null', () => {
        expect(parseNumberLineDirective('min=foo max=5')).toBeNull();
    });

    it('未知のトレーリングトークンが残れば null', () => {
        expect(parseNumberLineDirective('min=0 max=5 garbage')).toBeNull();
    });
});

describe('renderNumberLineSvg', () => {
    it('min >= max の場合はエラー span を返す', () => {
        const svg = renderNumberLineSvg({ min: 5, max: 5, marks: [] });
        expect(svg).toContain('numberline-error');
    });

    it('整数 tick を min..max の整数位置に配置する', () => {
        const svg = renderNumberLineSvg({ min: -2, max: 2, marks: [] });
        // -2, -1, 0, 1, 2 の 5 個 tick
        const tickCount = (svg.match(/<line [^>]*y1="54"/g) || []).length;
        expect(tickCount).toBe(5);
    });

    it('範囲外の mark は無視する', () => {
        const svg = renderNumberLineSvg({
            min: 0,
            max: 10,
            marks: [
                { label: 'IN', value: 5 },
                { label: 'OUT', value: 100 },
                { label: 'BELOW', value: -1 },
            ],
        });
        expect(svg).toContain('IN');
        expect(svg).not.toContain('OUT');
        expect(svg).not.toContain('BELOW');
    });

    it('mark label に含まれる特殊文字をエスケープする', () => {
        const svg = renderNumberLineSvg({
            min: 0,
            max: 5,
            marks: [{ label: '<x>', value: 2 }],
        });
        expect(svg).toContain('&lt;x&gt;');
        expect(svg).not.toContain('<x>');
    });

    it('SVG の aria-label に範囲情報を含める', () => {
        const svg = renderNumberLineSvg({ min: -3, max: 4, marks: [] });
        expect(svg).toContain('aria-label="数直線 -3 から 4"');
    });
});

describe('expandNumberLineDirectives', () => {
    it('正しい [[numberline ...]] を SVG に展開する', () => {
        const out = expandNumberLineDirectives('前 [[numberline min=-5 max=5 marks="A:-3"]] 後');
        expect(out).toContain('<svg class="numberline"');
        expect(out.startsWith('前 ')).toBe(true);
        expect(out.endsWith(' 後')).toBe(true);
    });

    it('パース失敗時は元のテキストを残す', () => {
        const original = '[[numberline min=foo]]';
        expect(expandNumberLineDirectives(original)).toBe(original);
    });

    it('複数のディレクティブを独立に展開する', () => {
        const out = expandNumberLineDirectives(
            '[[numberline min=0 max=3]]と[[numberline min=-1 max=1]]'
        );
        const matches = out.match(/<svg class="numberline"/g) || [];
        expect(matches.length).toBe(2);
    });
});
