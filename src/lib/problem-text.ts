import katex from 'katex';

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

        let nextDollar = text.indexOf('$', index);
        if (nextDollar === -1) {
            nextDollar = text.length;
        }

        if (nextDollar === index) {
            html += '&#36;';
            index += 1;
            continue;
        }

        html += escapeHtml(text.slice(index, nextDollar)).replace(/\n/g, '<br />');
        index = nextDollar;
    }

    return html;
}
