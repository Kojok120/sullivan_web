import { describe, expect, it } from 'vitest';

import { renderProblemTextHtml } from './problem-text';

describe('renderProblemTextHtml', () => {
    it('未閉じの単一ドル記号を文字として扱う', () => {
        const html = renderProblemTextHtml('xの値は $ の右に書きます');

        expect(html).toContain('xの値は &#36; の右に書きます');
    });

    it('未閉じの二重ドル記号を文字として扱う', () => {
        const html = renderProblemTextHtml('式 $$x+1 を確認する');

        expect(html).toContain('式 &#36;&#36;x+1 を確認する');
    });

    it('閉じた数式はこれまでどおり KaTeX として描画する', () => {
        const html = renderProblemTextHtml('二次関数は $y=x^2$ です');

        expect(html).toContain('class="katex"');
        expect(html).toContain('二次関数は ');
    });

    it('[[coordplane ...]] を SVG に展開する', () => {
        const html = renderProblemTextHtml('図: [[coordplane xmin=-5 xmax=5 ymin=-5 ymax=5 points="P:1,2"]]');

        expect(html).toContain('図: ');
        expect(html).toContain('<svg class="coordplane"');
    });

    it('閉じない [[coordplane は文字列として残す', () => {
        const html = renderProblemTextHtml('未閉: [[coordplane xmin=-5 xmax=5 ymin=-5 ymax=5');

        expect(html).toContain('[[coordplane');
        expect(html).not.toContain('<svg');
    });

    it('[[answertable ...]] を HTML テーブルに展開する', () => {
        const html = renderProblemTextHtml('解答: [[answertable headers="x,y" rows=2]]');

        expect(html).toContain('解答: ');
        expect(html).toContain('<table class="answertable"');
        expect(html).toContain('answertable-blank');
    });

    it('[[geometry ...]] を SVG に展開する', () => {
        const html = renderProblemTextHtml(
            '図形: [[geometry vertices="A:0,0;B:3,0;C:0,4" segments="A-B;B-C;C-A"]]',
        );

        expect(html).toContain('図形: ');
        expect(html).toContain('<svg class="geometry"');
    });
});
