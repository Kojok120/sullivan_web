import katex from 'katex';
import { parseNumberLineDirective, renderNumberLineSvg } from '@/lib/number-line-svg';

const NUMBERLINE_OPENER = '[[numberline';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderKatexFragment(latex: string, displayMode: boolean) {
    try {
        return katex.renderToString(latex.trim(), {
            displayMode,
            throwOnError: false,
            output: 'htmlAndMathml',
        });
    } catch {
        return `<code>${escapeHtml(latex)}</code>`;
    }
}

export function renderProblemTextHtml(text: string): string {
    if (!text) return '';

    let index = 0;
    let html = '';

    while (index < text.length) {
        if (text.startsWith(NUMBERLINE_OPENER, index)) {
            const end = text.indexOf(']]', index + NUMBERLINE_OPENER.length);
            if (end !== -1) {
                const body = text.slice(index + NUMBERLINE_OPENER.length, end);
                const opts = parseNumberLineDirective(body);
                if (opts) {
                    html += renderNumberLineSvg(opts);
                    index = end + 2;
                    continue;
                }
            }
        }

        if (text.startsWith('$$', index)) {
            const end = text.indexOf('$$', index + 2);
            if (end !== -1) {
                html += `<div class="katex-display">${renderKatexFragment(text.slice(index + 2, end), true)}</div>`;
                index = end + 2;
                continue;
            }

            html += '&#36;&#36;';
            index += 2;
            continue;
        }

        if (text[index] === '$') {
            let end = index + 1;
            while (end < text.length) {
                if (text[end] === '$' && text[end - 1] !== '\\') {
                    break;
                }
                end += 1;
            }

            if (end < text.length) {
                html += renderKatexFragment(text.slice(index + 1, end), false);
                index = end + 1;
                continue;
            }
        }

        let nextSpecial = text.indexOf('$', index);
        if (nextSpecial === -1) nextSpecial = text.length;
        const nextDirective = text.indexOf(NUMBERLINE_OPENER, index);
        if (nextDirective !== -1 && nextDirective < nextSpecial) {
            nextSpecial = nextDirective;
        }

        if (nextSpecial === index) {
            // 直前の判定で閉じなかった $ または [[numberline をリテラルとして処理
            if (text[index] === '$') {
                html += '&#36;';
                index += 1;
            } else {
                // 閉じ ]] が無い [[numberline は 1 文字ずつ落とし込む
                html += escapeHtml(text[index]);
                index += 1;
            }
            continue;
        }

        html += escapeHtml(text.slice(index, nextSpecial)).replace(/\n/g, '<br />');
        index = nextSpecial;
    }

    return html;
}
