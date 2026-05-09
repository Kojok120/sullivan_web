import { describe, expect, it } from 'vitest';

import {
    buildAnswerTableDirective,
    expandAnswerTableDirectives,
    expandAnswerTableDirectivesAsText,
    parseAnswerTableDirective,
    renderAnswerTableHtml,
} from './answer-table-svg';

describe('parseAnswerTableDirective', () => {
    it('headers + rows で全空セルのテーブル指定をパースできる', () => {
        const opts = parseAnswerTableDirective('headers="x,y,z" rows=3');
        expect(opts?.headers).toEqual(['x', 'y', 'z']);
        expect(opts?.cells).toEqual([
            ['', '', ''],
            ['', '', ''],
            ['', '', ''],
        ]);
    });

    it('prefill が指定されたら rows より優先する', () => {
        const opts = parseAnswerTableDirective('headers="x,y" rows=10 prefill="1,_;2,_;3,_"');
        expect(opts?.cells).toEqual([
            ['1', '_'],
            ['2', '_'],
            ['3', '_'],
        ]);
    });

    it('prefill が headers 列数より少なければ空セルで埋める', () => {
        const opts = parseAnswerTableDirective('headers="x,y,z" prefill="1;2"');
        expect(opts?.cells).toEqual([
            ['1', '', ''],
            ['2', '', ''],
        ]);
    });

    it('headers が無い / rows も prefill も無い場合は null', () => {
        expect(parseAnswerTableDirective('rows=3')).toBeNull();
        expect(parseAnswerTableDirective('headers="x,y"')).toBeNull();
    });

    it('rows が 0 や負数なら null', () => {
        expect(parseAnswerTableDirective('headers="x" rows=0')).toBeNull();
        expect(parseAnswerTableDirective('headers="x" rows=-1')).toBeNull();
    });

    it('上限を超える列数 / 行数なら null', () => {
        expect(parseAnswerTableDirective('headers="a,b,c,d,e,f,g,h,i" rows=2')).toBeNull();
        expect(parseAnswerTableDirective('headers="x" rows=21')).toBeNull();
    });
});

describe('renderAnswerTableHtml', () => {
    it('thead と tbody を返す', () => {
        const html = renderAnswerTableHtml({
            headers: ['x', 'y'],
            cells: [['', ''], ['1', '']],
        });
        expect(html).toContain('<table class="answertable"');
        expect(html).toContain('<th scope="col">x</th>');
        expect(html).toContain('<th scope="col">y</th>');
        expect(html).toContain('answertable-blank');
        expect(html).toContain('<td>1</td>');
    });

    it('ヘッダーとセルは HTML エスケープされる', () => {
        const html = renderAnswerTableHtml({
            headers: ['a<b'],
            cells: [['<x>']],
        });
        expect(html).toContain('a&lt;b');
        expect(html).toContain('&lt;x&gt;');
    });

    it('headers が空ならエラー span', () => {
        const html = renderAnswerTableHtml({ headers: [], cells: [['']] });
        expect(html).toContain('answertable-error');
    });

    it('cells が空ならエラー span', () => {
        const html = renderAnswerTableHtml({ headers: ['x'], cells: [] });
        expect(html).toContain('answertable-error');
    });
});

describe('expandAnswerTableDirectives', () => {
    it('テキスト中の [[answertable ...]] を HTML テーブルに置換する', () => {
        const out = expandAnswerTableDirectives('解答: [[answertable headers="x,y" rows=2]] を埋めなさい');
        expect(out).toContain('<table class="answertable"');
        expect(out).toContain('解答: ');
        expect(out).toContain(' を埋めなさい');
    });

    it('パース失敗ならテキストはそのまま', () => {
        const text = '不正: [[answertable headers="x"]]';
        expect(expandAnswerTableDirectives(text)).toBe(text);
    });
});

describe('buildAnswerTableDirective', () => {
    it('全空セルなら rows 形式に正規化する', () => {
        const dsl = buildAnswerTableDirective({
            headers: ['x', 'y'],
            cells: [['', ''], ['', '']],
        });
        expect(dsl).toBe('[[answertable headers="x,y" rows=2]]');
    });

    it('prefill がある場合は prefill 形式に正規化する', () => {
        const dsl = buildAnswerTableDirective({
            headers: ['x', 'y'],
            cells: [['1', ''], ['2', '4']],
        });
        expect(dsl).toBe('[[answertable headers="x,y" prefill="1,_;2,4"]]');
    });

    it('組み立て→パースで往復しても元に戻る', () => {
        const original = {
            headers: ['x', 'y'],
            cells: [['1', ''], ['2', '4']],
        };
        const dsl = buildAnswerTableDirective(original);
        const parsed = parseAnswerTableDirective(dsl.replace(/^\[\[answertable\s+/, '').replace(/\]\]$/, ''));
        expect(parsed?.headers).toEqual(original.headers);
        expect(parsed?.cells).toEqual([['1', '_'], ['2', '4']]);
    });
});

describe('expandAnswerTableDirectivesAsText', () => {
    it('空セルは _ として出力される', () => {
        const out = expandAnswerTableDirectivesAsText('[[answertable headers="x,y" prefill="1,_;_,4"]]');
        expect(out).toContain('解答欄表');
        expect(out).toContain('x | y');
        expect(out).toContain('1 | _');
        expect(out).toContain('_ | 4');
    });
});
