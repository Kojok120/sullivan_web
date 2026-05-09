import { describe, expect, it } from 'vitest';

import {
    buildSolidDirective,
    expandSolidDirectives,
    expandSolidDirectivesAsText,
    parseSolidDirective,
    renderSolidSvg,
    type SolidOptions,
} from './solid-svg';

/** [[solid ...]] を剥がして parseSolidDirective に渡すユーティリティ。 */
function parseFromDirective(dsl: string): SolidOptions | null {
    const m = dsl.match(/^\[\[solid\s+(.*)\]\]$/);
    if (!m) return null;
    return parseSolidDirective(m[1]);
}

describe('parseSolidDirective', () => {
    it('rect-prism の必須属性 w/h/d をパースする', () => {
        const opts = parseSolidDirective('kind="rect-prism" w=3 h=4 d=6');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'rect-prism', w: 3, h: 4, d: 6 });
    });

    it('cube の size と diagonal/labels をパースする', () => {
        const opts = parseSolidDirective('kind="cube" size=4 diagonal=true labels="A,B,C,D,E,F,G,H"');
        expect(opts).not.toBeNull();
        expect(opts!.kind).toBe('cube');
        expect(opts!.size).toBe(4);
        expect(opts!.diagonal).toBe(true);
        expect(opts!.labels).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    });

    it('cylinder の r/h と showDiameter をパースする', () => {
        const opts = parseSolidDirective('kind="cylinder" r=2 h=5 showDiameter=true');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'cylinder', r: 2, h: 5, showDiameter: true });
    });

    it('cone の r/h と showSlant をパースする', () => {
        const opts = parseSolidDirective('kind="cone" r=4 h=9 showSlant=true');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'cone', r: 4, h: 9, showSlant: true });
    });

    it('sphere の r をパースする', () => {
        const opts = parseSolidDirective('kind="sphere" r=6');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'sphere', r: 6 });
    });

    it('hemisphere の r をパースする', () => {
        const opts = parseSolidDirective('kind="hemisphere" r=9');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'hemisphere', r: 9 });
    });

    it('square-pyramid の w/d/h をパースする', () => {
        const opts = parseSolidDirective('kind="square-pyramid" w=4 d=4 h=6');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'square-pyramid', w: 4, d: 4, h: 6 });
    });

    it('tri-prism の base/h をパースする', () => {
        const opts = parseSolidDirective('kind="tri-prism" base="3,4,5" h=6');
        expect(opts).not.toBeNull();
        expect(opts!.kind).toBe('tri-prism');
        expect(opts!.base).toEqual([3, 4, 5]);
        expect(opts!.h).toBe(6);
    });

    it('rotation rectangle の shape/w/h をパースする', () => {
        const opts = parseSolidDirective('kind="rotation" shape="rectangle" w=6 h=9');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'rotation', shape: 'rectangle', w: 6, h: 9 });
    });

    it('rotation triangle の shape/b/h をパースする', () => {
        const opts = parseSolidDirective('kind="rotation" shape="triangle" b=3 h=4');
        expect(opts).not.toBeNull();
        expect(opts).toMatchObject({ kind: 'rotation', shape: 'triangle', b: 3, h: 4 });
    });

    it('kind 不明はパース失敗', () => {
        expect(parseSolidDirective('kind="torus" r=1')).toBeNull();
    });

    it('kind が無いとパース失敗', () => {
        expect(parseSolidDirective('w=3 h=4 d=6')).toBeNull();
    });

    it('負値や 0 の寸法はパース失敗', () => {
        expect(parseSolidDirective('kind="cylinder" r=-1 h=5')).toBeNull();
        expect(parseSolidDirective('kind="rect-prism" w=0 h=4 d=6')).toBeNull();
        expect(parseSolidDirective('kind="cube" size=0')).toBeNull();
    });

    it('cone で h を省略し slant <= r だと退化形なのでパース失敗', () => {
        // slant == r → 高さ 0 の退化形
        expect(parseSolidDirective('kind="cone" r=4 slant=4')).toBeNull();
        // slant < r → √(slant²-r²) が虚数で実高無し
        expect(parseSolidDirective('kind="cone" r=4 slant=3')).toBeNull();
        // h を明示すれば slant 不要で OK
        expect(parseSolidDirective('kind="cone" r=4 h=3')).not.toBeNull();
        // slant > r なら h 省略でも OK
        expect(parseSolidDirective('kind="cone" r=3 slant=5')).not.toBeNull();
    });

    it('rect-prism で必須属性が欠落するとパース失敗', () => {
        expect(parseSolidDirective('kind="rect-prism" w=3 h=4')).toBeNull();
    });

    it('tri-prism で三角不等式を満たさない base はパース失敗', () => {
        expect(parseSolidDirective('kind="tri-prism" base="1,2,5" h=3')).toBeNull();
    });

    it('rotation で shape が不正だとパース失敗', () => {
        expect(parseSolidDirective('kind="rotation" shape="oval" w=4 h=3')).toBeNull();
    });
});

describe('renderSolidSvg', () => {
    const cases: Array<{ name: string; opts: SolidOptions }> = [
        { name: 'rect-prism', opts: { kind: 'rect-prism', w: 3, h: 4, d: 6 } },
        { name: 'cube', opts: { kind: 'cube', size: 4, diagonal: true } },
        { name: 'cylinder', opts: { kind: 'cylinder', r: 2, h: 5 } },
        { name: 'cone', opts: { kind: 'cone', r: 4, h: 9 } },
        { name: 'sphere', opts: { kind: 'sphere', r: 6 } },
        { name: 'hemisphere', opts: { kind: 'hemisphere', r: 9 } },
        { name: 'square-pyramid', opts: { kind: 'square-pyramid', w: 4, d: 4, h: 6 } },
        { name: 'tri-prism', opts: { kind: 'tri-prism', base: [3, 4, 5], h: 6 } },
        { name: 'rotation rectangle', opts: { kind: 'rotation', shape: 'rectangle', w: 6, h: 9 } },
        { name: 'rotation triangle', opts: { kind: 'rotation', shape: 'triangle', b: 3, h: 4 } },
    ];

    for (const c of cases) {
        it(`${c.name} は <svg> マークアップを返す`, () => {
            const svg = renderSolidSvg(c.opts);
            expect(svg.startsWith('<svg')).toBe(true);
            expect(svg.endsWith('</svg>')).toBe(true);
            expect(svg).toContain('class="solid"');
        });
    }

    it('不正なオプションではエラー span を返す', () => {
        const svg = renderSolidSvg({ kind: 'cylinder', r: -1, h: 5 } as SolidOptions);
        expect(svg).toContain('solid-error');
    });

    it('cube の頂点ラベルが SVG に含まれる', () => {
        const svg = renderSolidSvg({
            kind: 'cube',
            size: 4,
            labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        });
        for (const v of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
            expect(svg).toContain(`>${v}<`);
        }
    });

    it('rect-prism の寸法ラベルに cm が含まれる', () => {
        const svg = renderSolidSvg({ kind: 'rect-prism', w: 3, h: 4, d: 6 });
        expect(svg).toContain('3cm');
        expect(svg).toContain('4cm');
        expect(svg).toContain('6cm');
    });
});

describe('buildSolidDirective + parseSolidDirective round-trip', () => {
    const samples: SolidOptions[] = [
        { kind: 'rect-prism', w: 3, h: 4, d: 6 },
        { kind: 'cube', size: 4, diagonal: true },
        { kind: 'cube', size: 5, labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
        { kind: 'cylinder', r: 2, h: 5 },
        { kind: 'cylinder', r: 3, h: 7, showDiameter: true },
        { kind: 'cone', r: 4, h: 9 },
        { kind: 'cone', r: 3, h: 4, showSlant: true },
        { kind: 'sphere', r: 6 },
        { kind: 'sphere', r: 6, showDiameter: true },
        { kind: 'hemisphere', r: 9 },
        { kind: 'square-pyramid', w: 4, d: 4, h: 6 },
        { kind: 'tri-prism', base: [3, 4, 5], h: 6 },
        { kind: 'rotation', shape: 'rectangle', w: 6, h: 9 },
        { kind: 'rotation', shape: 'triangle', b: 3, h: 4 },
    ];

    for (const sample of samples) {
        it(`${sample.kind} の DSL 再構築結果が再パースで同一になる`, () => {
            const dsl = buildSolidDirective(sample);
            const reparsed = parseFromDirective(dsl);
            expect(reparsed).not.toBeNull();
            expect(reparsed).toEqual(sample);
        });
    }
});

describe('expandSolidDirectives', () => {
    it('テキスト中の [[solid]] を SVG に置換する', () => {
        const input = '次の立体を見よ: [[solid kind="cube" size=4]]';
        const out = expandSolidDirectives(input);
        expect(out).toContain('次の立体を見よ:');
        expect(out).toContain('<svg class="solid"');
    });

    it('パース失敗時は元のテキストを残す', () => {
        const input = '不正: [[solid kind="cube" size=-1]]';
        const out = expandSolidDirectives(input);
        expect(out).toBe(input);
    });
});

describe('expandSolidDirectivesAsText', () => {
    it('rect-prism の人間可読サマリを返す', () => {
        const input = '[[solid kind="rect-prism" w=3 h=4 d=6]]';
        const out = expandSolidDirectivesAsText(input);
        expect(out).toContain('[立体:');
        expect(out).toContain('直方体');
        expect(out).toContain('3');
        expect(out).toContain('6');
    });

    it('cylinder の人間可読サマリを返す', () => {
        const input = '[[solid kind="cylinder" r=2 h=5]]';
        const out = expandSolidDirectivesAsText(input);
        expect(out).toContain('円柱');
        expect(out).toContain('半径2');
        expect(out).toContain('高さ5');
    });

    it('rotation rectangle の人間可読サマリを返す', () => {
        const input = '[[solid kind="rotation" shape="rectangle" w=6 h=9]]';
        const out = expandSolidDirectivesAsText(input);
        expect(out).toContain('回転体');
        expect(out).toContain('矩形');
        expect(out).toContain('軸ℓ');
    });

    it('パース失敗時は元のテキストを残す', () => {
        const input = '[[solid kind="unknown"]]';
        const out = expandSolidDirectivesAsText(input);
        expect(out).toBe(input);
    });
});
