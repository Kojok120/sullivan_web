import katex from 'katex';
import { parseAnswerTableDirective, renderAnswerTableHtml } from '@sullivan/ui-kit/answer-table-svg';
import { parseCoordPlaneDirective, renderCoordPlaneSvg } from '@sullivan/ui-kit/coord-plane-svg';
import { parseGeometryDirective, renderGeometrySvg } from '@sullivan/ui-kit/geometry-svg';
import { parseNumberLineDirective, renderNumberLineSvg } from '@sullivan/ui-kit/number-line-svg';
import { parseSolidDirective, renderSolidSvg } from '@sullivan/ui-kit/solid-svg';

const NUMBERLINE_OPENER = '[[numberline';
const COORDPLANE_OPENER = '[[coordplane';
const ANSWERTABLE_OPENER = '[[answertable';
const GEOMETRY_OPENER = '[[geometry';
const SOLID_OPENER = '[[solid';

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

        if (text.startsWith(COORDPLANE_OPENER, index)) {
            const end = text.indexOf(']]', index + COORDPLANE_OPENER.length);
            if (end !== -1) {
                const body = text.slice(index + COORDPLANE_OPENER.length, end);
                const opts = parseCoordPlaneDirective(body);
                if (opts) {
                    // 同じ図を同一ページに複数置いた場合に marker id が衝突しないよう、
                    // 出現位置（テキスト先頭からの offset）を 36 進で suffix に渡す。
                    html += renderCoordPlaneSvg(opts, index.toString(36));
                    index = end + 2;
                    continue;
                }
            }
        }

        if (text.startsWith(ANSWERTABLE_OPENER, index)) {
            const end = text.indexOf(']]', index + ANSWERTABLE_OPENER.length);
            if (end !== -1) {
                const body = text.slice(index + ANSWERTABLE_OPENER.length, end);
                const opts = parseAnswerTableDirective(body);
                if (opts) {
                    html += renderAnswerTableHtml(opts);
                    index = end + 2;
                    continue;
                }
            }
        }

        if (text.startsWith(GEOMETRY_OPENER, index)) {
            const end = text.indexOf(']]', index + GEOMETRY_OPENER.length);
            if (end !== -1) {
                const body = text.slice(index + GEOMETRY_OPENER.length, end);
                const opts = parseGeometryDirective(body);
                if (opts) {
                    html += renderGeometrySvg(opts);
                    index = end + 2;
                    continue;
                }
            }
        }

        if (text.startsWith(SOLID_OPENER, index)) {
            const end = text.indexOf(']]', index + SOLID_OPENER.length);
            if (end !== -1) {
                const body = text.slice(index + SOLID_OPENER.length, end);
                const opts = parseSolidDirective(body);
                if (opts) {
                    html += renderSolidSvg(opts);
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
        const nextNumberLine = text.indexOf(NUMBERLINE_OPENER, index);
        if (nextNumberLine !== -1 && nextNumberLine < nextSpecial) {
            nextSpecial = nextNumberLine;
        }
        const nextCoordPlane = text.indexOf(COORDPLANE_OPENER, index);
        if (nextCoordPlane !== -1 && nextCoordPlane < nextSpecial) {
            nextSpecial = nextCoordPlane;
        }
        const nextAnswerTable = text.indexOf(ANSWERTABLE_OPENER, index);
        if (nextAnswerTable !== -1 && nextAnswerTable < nextSpecial) {
            nextSpecial = nextAnswerTable;
        }
        const nextGeometry = text.indexOf(GEOMETRY_OPENER, index);
        if (nextGeometry !== -1 && nextGeometry < nextSpecial) {
            nextSpecial = nextGeometry;
        }
        const nextSolid = text.indexOf(SOLID_OPENER, index);
        if (nextSolid !== -1 && nextSolid < nextSpecial) {
            nextSpecial = nextSolid;
        }

        if (nextSpecial === index) {
            // 直前の判定で閉じなかった $ または [[directive をリテラルとして処理
            if (text[index] === '$') {
                html += '&#36;';
                index += 1;
            } else {
                // 閉じ ]] が無い [[directive は 1 文字ずつ落とし込む
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
