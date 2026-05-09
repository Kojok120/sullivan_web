import { describe, expect, it } from 'vitest';

import {
    buildGeometryDirective,
    expandGeometryDirectives,
    expandGeometryDirectivesAsText,
    parseGeometryDirective,
    renderGeometrySvg,
} from './geometry-svg';

describe('parseGeometryDirective', () => {
    it('頂点のみのパースに成功する', () => {
        const opts = parseGeometryDirective('vertices="A:0,0;B:5,0;C:3,4"');

        expect(opts).not.toBeNull();
        expect(opts!.vertices).toEqual([
            { label: 'A', x: 0, y: 0 },
            { label: 'B', x: 5, y: 0 },
            { label: 'C', x: 3, y: 4 },
        ]);
        expect(opts!.segments).toEqual([]);
        expect(opts!.circles).toEqual([]);
    });

    it('頂点・線分・円の同時指定をパースする', () => {
        const opts = parseGeometryDirective(
            'vertices="A:0,0;B:5,0;C:3,4" segments="A-B;B-C;C-A" circles="O:2.5,2,1.5"',
        );

        expect(opts).not.toBeNull();
        expect(opts!.segments).toEqual([
            { from: 'A', to: 'B' },
            { from: 'B', to: 'C' },
            { from: 'C', to: 'A' },
        ]);
        expect(opts!.circles).toEqual([{ label: 'O', cx: 2.5, cy: 2, r: 1.5 }]);
    });

    it('未定義の頂点を参照する線分は失敗する', () => {
        expect(parseGeometryDirective('vertices="A:0,0;B:5,0" segments="A-X"')).toBeNull();
    });

    it('vertices が必須', () => {
        expect(parseGeometryDirective('segments="A-B"')).toBeNull();
    });

    it('頂点ラベル重複は失敗する', () => {
        expect(parseGeometryDirective('vertices="A:0,0;A:5,0"')).toBeNull();
    });

    it('数値でない座標は失敗する', () => {
        expect(parseGeometryDirective('vertices="A:abc,0"')).toBeNull();
    });

    it('円の半径が0以下は失敗する', () => {
        expect(parseGeometryDirective('vertices="A:0,0" circles="O:0,0,0"')).toBeNull();
        expect(parseGeometryDirective('vertices="A:0,0" circles="O:0,0,-1"')).toBeNull();
    });

    it('ラベル無し円も許容する', () => {
        const opts = parseGeometryDirective('vertices="A:0,0" circles="0,0,1"');
        expect(opts).not.toBeNull();
        expect(opts!.circles).toEqual([{ label: '', cx: 0, cy: 0, r: 1 }]);
    });

    it('自己参照線分は失敗する', () => {
        expect(parseGeometryDirective('vertices="A:0,0" segments="A-A"')).toBeNull();
    });
});

describe('renderGeometrySvg', () => {
    it('頂点・線分・円を含む SVG を生成する', () => {
        const opts = parseGeometryDirective(
            'vertices="A:0,0;B:5,0;C:3,4" segments="A-B;B-C;C-A" circles="O:2.5,2,1.5"',
        )!;
        const svg = renderGeometrySvg(opts);

        expect(svg).toContain('<svg class="geometry"');
        expect(svg).toContain('<line');
        expect(svg).toContain('<circle');
        expect(svg).toContain('>A<');
        expect(svg).toContain('>B<');
        expect(svg).toContain('>C<');
        expect(svg).toContain('>O<');
    });

    it('要素が空ならエラー span を返す', () => {
        const svg = renderGeometrySvg({ vertices: [], segments: [], angles: [], circles: [] });
        expect(svg).toContain('geometry-error');
    });
});

describe('buildGeometryDirective', () => {
    it('round-trip でパース可能な DSL を生成する', () => {
        const original = parseGeometryDirective(
            'vertices="A:0,0;B:5,0;C:3,4" segments="A-B;B-C;C-A" circles="O:2.5,2,1.5"',
        )!;
        const dsl = buildGeometryDirective(original);
        const reparsed = parseGeometryDirective(dsl.replace(/^\[\[geometry\s+/, '').replace(/\]\]$/, ''));

        expect(reparsed).toEqual(original);
    });

    it('線分・円なしでも頂点だけの DSL を生成できる', () => {
        const dsl = buildGeometryDirective({
            vertices: [{ label: 'P', x: 1, y: 2 }],
            segments: [],
            angles: [],
            circles: [],
        });
        expect(dsl).toBe('[[geometry vertices="P:1,2"]]');
    });
});

describe('geometry 拡張: 辺ラベル・角度マーク', () => {
    it('segments の `:label` 形式で辺ラベルをパースする', () => {
        const opts = parseGeometryDirective(
            'vertices="A:0,0;B:4,0;C:0,3" segments="A-B:4;B-C:5;C-A:3"',
        );
        expect(opts).not.toBeNull();
        expect(opts!.segments).toEqual([
            { from: 'A', to: 'B', label: '4' },
            { from: 'B', to: 'C', label: '5' },
            { from: 'C', to: 'A', label: '3' },
        ]);
    });

    it('angles をパースし、right/arc/ラベル付きを判別する', () => {
        const opts = parseGeometryDirective(
            'vertices="A:0,0;B:4,0;C:0,3" angles="A:right;B:60°;C"',
        );
        expect(opts).not.toBeNull();
        expect(opts!.angles).toEqual([
            { vertex: 'A', mark: 'right' },
            { vertex: 'B', mark: 'arc', label: '60°' },
            { vertex: 'C', mark: 'arc' },
        ]);
    });

    it('未定義頂点を参照する angle は失敗する', () => {
        expect(parseGeometryDirective('vertices="A:0,0" angles="X"')).toBeNull();
    });

    it('renderGeometrySvg は辺ラベル text と直角記号 polyline を含む', () => {
        const opts = parseGeometryDirective(
            'vertices="A:0,0;B:4,0;C:0,3" segments="A-B:4;B-C;C-A" angles="A:right"',
        )!;
        const svg = renderGeometrySvg(opts);
        expect(svg).toContain('>4<');
        expect(svg).toContain('<polyline');
    });

    it('renderGeometrySvg は角弧（path）と角ラベルを含む', () => {
        const opts = parseGeometryDirective(
            'vertices="A:0,0;B:4,0;C:2,3" segments="A-B;B-C;C-A" angles="B:60°"',
        )!;
        const svg = renderGeometrySvg(opts);
        expect(svg).toContain('<path');
        expect(svg).toContain('>60°<');
    });

    it('round-trip で辺ラベル・角度マークを再構築できる', () => {
        const original = parseGeometryDirective(
            'vertices="A:0,0;B:4,0;C:0,3" segments="A-B:4;B-C:5;C-A:3" angles="A:right;B:53°"',
        )!;
        const dsl = buildGeometryDirective(original);
        const reparsed = parseGeometryDirective(dsl.replace(/^\[\[geometry\s+/, '').replace(/\]\]$/, ''));
        expect(reparsed).toEqual(original);
    });
});

describe('geometry 拡張: angles の vertex/from-to 指定（3直線交点用）', () => {
    it('vertex/from-to 形式で同一頂点に複数角を許可する', () => {
        const opts = parseGeometryDirective(
            'vertices="O:0,0;A:3,0;B:1.5,2.6;C:-3,0;D:-1.5,-2.6" segments="A-C;B-D" angles="O/A-B:60°;O/B-C:120°;O/C-D:60°"',
        );
        expect(opts).not.toBeNull();
        expect(opts!.angles).toEqual([
            { vertex: 'O', from: 'A', to: 'B', mark: 'arc', label: '60°' },
            { vertex: 'O', from: 'B', to: 'C', mark: 'arc', label: '120°' },
            { vertex: 'O', from: 'C', to: 'D', mark: 'arc', label: '60°' },
        ]);
    });

    it('vertex/from-to の from/to が未定義頂点なら失敗する', () => {
        expect(parseGeometryDirective(
            'vertices="O:0,0;A:3,0" angles="O/A-Z:60°"',
        )).toBeNull();
    });

    it('vertex/from-to の同一方向重複は失敗する', () => {
        expect(parseGeometryDirective(
            'vertices="O:0,0;A:3,0;B:1.5,2.6" angles="O/A-B:60°;O/A-B:45°"',
        )).toBeNull();
    });

    it('from-to の self ループ（A-A）は失敗する', () => {
        expect(parseGeometryDirective(
            'vertices="O:0,0;A:3,0" angles="O/A-A"',
        )).toBeNull();
    });

    it('renderGeometrySvg は from/to 指定の角弧とラベルを出力する', () => {
        const opts = parseGeometryDirective(
            'vertices="O:0,0;A:3,0;B:1.5,2.6;C:-3,0" angles="O/A-B:60°"',
        )!;
        const svg = renderGeometrySvg(opts);
        expect(svg).toContain('<path');
        expect(svg).toContain('>60°<');
    });

    it('round-trip で vertex/from-to 形式を再構築できる', () => {
        const original = parseGeometryDirective(
            'vertices="O:0,0;A:3,0;B:1.5,2.6;C:-3,0" angles="O/A-B:60°;O/B-C:45°"',
        )!;
        const dsl = buildGeometryDirective(original);
        const reparsed = parseGeometryDirective(dsl.replace(/^\[\[geometry\s+/, '').replace(/\]\]$/, ''));
        expect(reparsed).toEqual(original);
    });

    it('既存ラベル名にスラッシュが含まれていても旧構文として解釈する（後方互換）', () => {
        // ラベル名に / を含む稀なデータが混入していても、from/to 部分が既知ラベルでなければ
        // head 全体を頂点ラベルとして扱う。新構文の貪欲解釈で既存データを壊さないことの回帰テスト。
        const opts = parseGeometryDirective(
            'vertices="A/1:0,0;B:5,0;C:3,4" angles="A/1:60°"',
        );
        expect(opts).not.toBeNull();
        expect(opts!.angles).toEqual([
            { vertex: 'A/1', mark: 'arc', label: '60°' },
        ]);
    });

    it('スラッシュを含むがどれもラベル一致しない head は頂点ラベルとして失敗する', () => {
        // V/from-to の 3 要素のうち 1 つでも未定義なら新構文と認めず、head 全体を vertex として
        // 解釈する。その vertex も未定義ならエラー（null）を返す。
        expect(parseGeometryDirective(
            'vertices="A:0,0;B:5,0" angles="X/A-B:60°"',
        )).toBeNull();
    });
});

describe('expandGeometryDirectives', () => {
    it('テキスト中の [[geometry]] を SVG に置換する', () => {
        const input = '次の三角形を見よ: [[geometry vertices="A:0,0;B:3,0;C:0,4" segments="A-B;B-C;C-A"]]';
        const out = expandGeometryDirectives(input);

        expect(out).toContain('次の三角形を見よ:');
        expect(out).toContain('<svg class="geometry"');
    });

    it('パース失敗時は元のテキストを残す', () => {
        const input = '不正: [[geometry vertices="A:abc,def"]]';
        const out = expandGeometryDirectives(input);
        expect(out).toBe(input);
    });
});

describe('expandGeometryDirectivesAsText', () => {
    it('AI 採点用の人間可読サマリを返す', () => {
        const input = '[[geometry vertices="A:0,0;B:3,0;C:0,4" segments="A-B;B-C;C-A"]]';
        const out = expandGeometryDirectivesAsText(input);

        expect(out).toContain('[図形]');
        expect(out).toContain('A(0,0)');
        expect(out).toContain('A-B');
    });
});
