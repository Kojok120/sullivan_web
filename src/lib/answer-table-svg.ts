/**
 * 問題文中の解答欄テーブル記法
 *   `[[answertable headers="x,y,z" rows=3]]`
 *   `[[answertable headers="x,y" prefill="1,_;2,_;3,_"]]`
 * を、生徒がプリント上で書き込むための空セル付き HTML テーブルに展開する。
 *
 * SVG ではなく `<table>` を出すのは、行高がプリント時の line-height に追従して
 * 自動的に手書きスペースを確保できるため。
 *
 * 仕様:
 * - headers: 列ヘッダーをカンマ区切りで列挙（最低 1 列）
 * - rows: 整数。指定があれば全セル空の N 行を生成する
 * - prefill: `セル,セル,...;行,...` 形式。`_` は空セルを表す。
 *   prefill が指定された場合は rows より優先する。
 * - 不正な指定は元のテキストをそのまま残す（非破壊）
 */

export type AnswerTableOptions = {
    headers: string[];
    /** prefill[r][c] が undefined または空文字なら空セル */
    cells: string[][];
};

const MAX_COLS = 8;
const MAX_ROWS = 20;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 解答欄テーブルの HTML を生成する。失敗時は説明的なエラー span を返す。
 */
export function renderAnswerTableHtml(options: AnswerTableOptions): string {
    const { headers, cells } = options;

    if (headers.length === 0 || headers.length > MAX_COLS) {
        return `<span class="answertable-error">解答欄テーブルのヘッダーが不正です</span>`;
    }
    if (cells.length === 0 || cells.length > MAX_ROWS) {
        return `<span class="answertable-error">解答欄テーブルの行数が不正です</span>`;
    }

    const headerHtml = headers
        .map((h) => `<th scope="col">${escapeHtml(h)}</th>`)
        .join('');

    const rowsHtml = cells
        .map((row) => {
            const cellHtml = headers
                .map((_, colIndex) => {
                    const raw = row[colIndex] ?? '';
                    const trimmed = raw.trim();
                    if (trimmed === '' || trimmed === '_') {
                        return `<td class="answertable-blank" aria-label="空欄"></td>`;
                    }
                    return `<td>${escapeHtml(trimmed)}</td>`;
                })
                .join('');
            return `<tr>${cellHtml}</tr>`;
        })
        .join('');

    return `<table class="answertable" role="table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

/**
 * `[[answertable ... ]]` の中身（key=value または key="value" の連なり）をパースする。
 * 失敗時は null を返す。
 */
export function parseAnswerTableDirective(body: string): AnswerTableOptions | null {
    const attrs = parseAttributes(body);
    if (!attrs) return null;

    const headersStr = attrs.get('headers');
    if (headersStr === undefined) return null;

    const headers = headersStr
        .split(',')
        .map((h) => h.trim())
        .filter((h) => h.length > 0);
    if (headers.length === 0 || headers.length > MAX_COLS) return null;

    const prefillStr = attrs.get('prefill');
    if (prefillStr !== undefined && prefillStr.trim().length > 0) {
        const cells = prefillStr
            .split(';')
            .map((row) => row.split(',').map((cell) => cell.trim()));
        if (cells.length === 0 || cells.length > MAX_ROWS) return null;
        const normalizedCells = cells.map((row) => {
            const next = row.slice(0, headers.length);
            while (next.length < headers.length) next.push('');
            return next;
        });
        return { headers, cells: normalizedCells };
    }

    const rowsStr = attrs.get('rows');
    const rows = rowsStr === undefined ? 0 : Number(rowsStr);
    if (!Number.isInteger(rows) || rows <= 0 || rows > MAX_ROWS) return null;

    const blankCells: string[][] = Array.from({ length: rows }, () => Array.from({ length: headers.length }, () => ''));
    return { headers, cells: blankCells };
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
    const tail = body.slice(lastIndex).trim();
    if (tail.length > 0) return null;
    return result;
}

/**
 * AnswerTableOptions から DSL 文字列を再構築する（編集 UI で answerTemplate を更新するときに使う）。
 */
export function buildAnswerTableDirective(options: AnswerTableOptions): string {
    const headers = options.headers.map((h) => escapeForAttr(h)).join(',');
    const allBlank = options.cells.every((row) => row.every((cell) => cell.trim() === '' || cell.trim() === '_'));
    if (allBlank) {
        return `[[answertable headers="${headers}" rows=${options.cells.length}]]`;
    }
    const prefill = options.cells
        .map((row) => row.map((cell) => {
            const trimmed = cell.trim();
            return trimmed === '' ? '_' : escapeForAttr(trimmed);
        }).join(','))
        .join(';');
    return `[[answertable headers="${headers}" prefill="${prefill}"]]`;
}

function escapeForAttr(value: string): string {
    // ダブルクォートとセミコロン/カンマは DSL の区切り文字なのでサニタイズ
    return value.replace(/[",;]/g, '');
}

/**
 * テキスト中の `[[answertable ...]]` を検出し、HTML テーブルに置換する。
 * パース失敗時は元のテキストをそのまま残す。
 */
export function expandAnswerTableDirectives(text: string): string {
    const re = /\[\[answertable\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseAnswerTableDirective(body);
        if (!opts) return full;
        return renderAnswerTableHtml(opts);
    });
}

/**
 * AI 採点用の人間可読サマリ。SVG/HTML ではなくテキスト要約を返す。
 */
export function expandAnswerTableDirectivesAsText(text: string): string {
    const re = /\[\[answertable\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseAnswerTableDirective(body);
        if (!opts) return full;
        return summarizeAnswerTable(opts);
    });
}

function summarizeAnswerTable(opts: AnswerTableOptions): string {
    const cellsSummary = opts.cells
        .map((row) => row.map((cell) => {
            const t = cell.trim();
            return t === '' || t === '_' ? '_' : t;
        }).join(' | '))
        .join('\n');
    return `[解答欄表]\n${opts.headers.join(' | ')}\n${cellsSummary}`;
}

export { MAX_COLS as ANSWER_TABLE_MAX_COLS, MAX_ROWS as ANSWER_TABLE_MAX_ROWS };
