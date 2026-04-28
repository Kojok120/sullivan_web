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
});
