/**
 * 問題文中の数直線記法 `[[numberline min=-5 max=5 marks="A:-3,B:2,C:4.5"]]` を
 * インライン SVG に展開するユーティリティ。
 *
 * 仕様:
 * - min / max は必須（整数 / 小数いずれも可、min < max）
 * - marks は `label:value` のカンマ区切り（label 空可、value は数値）
 * - 範囲外の mark は無視する
 * - tick は min..max の整数位置のみ（仕様簡素化のため）
 *
 * サーバ側で文字列 SVG を生成し、`dangerouslySetInnerHTML` で
 * 既存の `renderProblemTextHtml` に埋め込む前提。クライアント JS 不要。
 */

export type NumberLineMark = {
    label: string;
    value: number;
};

export type NumberLineOptions = {
    min: number;
    max: number;
    marks: NumberLineMark[];
};

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 100;
const PADDING_X = 40; // 矢印の余白
const AXIS_Y = 60;
const TICK_HEIGHT = 6;
const NUMBER_Y = AXIS_Y + 22;
const MARK_RADIUS = 4;
const MARK_LABEL_Y = AXIS_Y - 14;

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function project(value: number, min: number, max: number): number {
    const ratio = (value - min) / (max - min);
    return PADDING_X + ratio * (VIEW_WIDTH - PADDING_X * 2);
}

/**
 * 数値を表示用文字列にする（整数なら整数、小数なら小数）。
 */
function formatNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(2)));
}

/**
 * 数直線 SVG マークアップを生成する。失敗時は説明的なエラー span を返す。
 */
export function renderNumberLineSvg(options: NumberLineOptions): string {
    const { min, max, marks } = options;

    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        return `<span class="numberline-error">数直線の範囲が不正です: min=${escapeXml(String(min))}, max=${escapeXml(String(max))}</span>`;
    }

    const tickStart = Math.ceil(min);
    const tickEnd = Math.floor(max);

    const ticks: string[] = [];
    const numbers: string[] = [];
    for (let v = tickStart; v <= tickEnd; v += 1) {
        const x = project(v, min, max);
        ticks.push(
            `<line x1="${x}" y1="${AXIS_Y - TICK_HEIGHT}" x2="${x}" y2="${AXIS_Y + TICK_HEIGHT}" stroke="currentColor" stroke-width="1" />`
        );
        numbers.push(
            `<text x="${x}" y="${NUMBER_Y}" text-anchor="middle" font-size="14" fill="currentColor">${formatNumber(v)}</text>`
        );
    }

    const markEls: string[] = [];
    for (const mark of marks) {
        if (!Number.isFinite(mark.value)) continue;
        if (mark.value < min || mark.value > max) continue;
        const x = project(mark.value, min, max);
        markEls.push(
            `<circle cx="${x}" cy="${AXIS_Y}" r="${MARK_RADIUS}" fill="currentColor" />`
        );
        if (mark.label) {
            markEls.push(
                `<text x="${x}" y="${MARK_LABEL_Y}" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor">${escapeXml(mark.label)}</text>`
            );
        }
    }

    const lineY = AXIS_Y;
    const lineX1 = PADDING_X - 10;
    const lineX2 = VIEW_WIDTH - PADDING_X + 10;

    // arrow heads via marker
    const defs = `<defs>
        <marker id="nl-arrow-left" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" />
        </marker>
        <marker id="nl-arrow-right" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
    </defs>`;

    const axisLine = `<line x1="${lineX1}" y1="${lineY}" x2="${lineX2}" y2="${lineY}" stroke="currentColor" stroke-width="1.5" marker-start="url(#nl-arrow-left)" marker-end="url(#nl-arrow-right)" />`;

    return `<svg class="numberline" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="数直線 ${formatNumber(min)} から ${formatNumber(max)}">${defs}${axisLine}${ticks.join('')}${numbers.join('')}${markEls.join('')}</svg>`;
}

/**
 * `[[numberline ... ]]` の中身（key=value または key="value" の連なり）をパースする。
 * 失敗時は null を返す。
 */
export function parseNumberLineDirective(body: string): NumberLineOptions | null {
    const attrs = parseAttributes(body);
    if (!attrs) return null;

    const minStr = attrs.get('min');
    const maxStr = attrs.get('max');
    if (minStr === undefined || maxStr === undefined) return null;

    const min = Number(minStr);
    const max = Number(maxStr);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

    const marks = parseMarks(attrs.get('marks') ?? '');

    return { min, max, marks };
}

function parseAttributes(body: string): Map<string, string> | null {
    const result = new Map<string, string>();
    const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(-?\.?\d[\w.\-]*))/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = re.exec(body)) !== null) {
        const key = match[1];
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        result.set(key, value);
        lastIndex = re.lastIndex;
    }
    // 残りの非空白文字があれば形式不正とみなす
    const tail = body.slice(lastIndex).trim();
    if (tail.length > 0) return null;
    return result;
}

function parseMarks(spec: string): NumberLineMark[] {
    if (!spec.trim()) return [];
    const items = spec.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const marks: NumberLineMark[] = [];
    for (const item of items) {
        const colon = item.indexOf(':');
        if (colon === -1) {
            const value = Number(item);
            if (Number.isFinite(value)) marks.push({ label: '', value });
            continue;
        }
        const label = item.slice(0, colon).trim();
        const valueStr = item.slice(colon + 1).trim();
        const value = Number(valueStr);
        if (Number.isFinite(value)) marks.push({ label, value });
    }
    return marks;
}

/**
 * テキスト中の `[[numberline ...]]` を検出し、SVG に置換する。
 * ディレクティブは 1 行内に閉じる前提（`]]` まで）。
 * パース失敗時は元のテキストをそのまま残す（KaTeX 失敗時と同じ非破壊方針）。
 */
export function expandNumberLineDirectives(text: string): string {
    const re = /\[\[numberline\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseNumberLineDirective(body);
        if (!opts) return full;
        return renderNumberLineSvg(opts);
    });
}

/**
 * AI 採点用の人間可読サマリ。SVG ではなくテキスト要約を返す。
 */
export function expandNumberLineDirectivesAsText(text: string): string {
    const re = /\[\[numberline\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseNumberLineDirective(body);
        if (!opts) return full;
        const marks = opts.marks
            .map((m) => (m.label ? `${m.label}=${m.value}` : String(m.value)))
            .join(', ');
        return marks
            ? `[数直線] 範囲 ${opts.min}〜${opts.max}, マーク: ${marks}`
            : `[数直線] 範囲 ${opts.min}〜${opts.max}`;
    });
}
