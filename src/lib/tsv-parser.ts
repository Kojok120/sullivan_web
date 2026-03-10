/**
 * TSVパーサ - Excel/スプレッドシートからの貼り付けに対応
 * 引用符内の改行をサポート
 */
function parseTSV(input: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < input.length) {
        const char = input[i];
        const nextChar = input[i + 1];

        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // エスケープされた引用符
                    currentField += '"';
                    i += 2;
                } else {
                    // 引用符で囲まれたフィールドの終端
                    inQuotes = false;
                    i++;
                }
            } else {
                currentField += char;
                i++;
            }
        } else {
            if (char === '"') {
                // 引用符で囲まれたフィールドの開始
                inQuotes = true;
                i++;
            } else if (char === '\t') {
                // フィールド区切り
                currentRow.push(currentField.trim());
                currentField = '';
                i++;
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                // 行区切り
                currentRow.push(currentField.trim());
                if (currentRow.some(cell => cell.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                i += (char === '\r' ? 2 : 1);
            } else if (char === '\r') {
                // 単独の CR も行区切りとして扱う
                currentRow.push(currentField.trim());
                if (currentRow.some(cell => cell.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                i++;
            } else {
                currentField += char;
                i++;
            }
        }
    }

    // 末尾のフィールドと行を取り込む
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
    }

    return rows;
}

/**
 * 問題一括登録用のフォーマットでパース
 * カラム: [学年] [CoreProblem名] [問題文] [正解] [別解(任意)] [動画URL(任意)]
 */
export interface ParsedProblemRow {
    masterNumber?: number; // マスタ内問題番号
    grade: string;
    coreProblemName: string;
    coreProblemNames: string[]; // 複数対応 (改行・カンマ区切り)
    question: string;
    answer: string;
    acceptedAnswers: string[];
    videoUrl: string;
}

export function parseProblemTSV(input: string, skipHeader = true): ParsedProblemRow[] {
    const rows = parseTSV(input);
    const problemHeaderFormat = detectProblemHeaderFormat(rows[0]) ?? inferProblemRowFormat(rows[0]);

    const dataRows = skipHeader
        ? excludeLeadingHeaderRow(rows, isProblemHeaderRow)
        : rows;

    return dataRows.map(cols => {
        const usesLegacyColumns = problemHeaderFormat === 'old';
        const columnOffset = usesLegacyColumns ? 0 : 1;

        // 新形式:
        // 0: マスタ内問題番号, 1: 学年, 2: CoreProblem名, 3: 問題文, 4: 正解, 5: 別解(任意), 6: 動画URL(任意)
        // 旧形式:
        // 0: 学年, 1: CoreProblem名, 2: 問題文, 3: 正解, 4: 別解(任意), 5: 動画URL(任意)

        let masterNumber: number | undefined;
        if (!usesLegacyColumns && cols[0]) {
            const parsed = parseInt(cols[0].replace(/[^\d]/g, ''), 10);
            if (!isNaN(parsed)) {
                masterNumber = parsed;
            }
        }

        const grade = cols[columnOffset] || '';
        const cpRaw = cols[columnOffset + 1] || '';
        const question = cols[columnOffset + 2] || '';
        const answer = cols[columnOffset + 3] || '';
        const acceptedRaw = cols[columnOffset + 4] || '';
        const videoUrl = cols[columnOffset + 5] || '';

        // CoreProblem 名はカンマまたは改行区切りに対応する
        const coreProblemNames = cpRaw.split(/[,\n、]+/).map(s => s.trim()).filter(Boolean);
        const coreProblemName = cpRaw; // 単一名利用時のため元の文字列も保持する

        // 別解はカンマ区切りで解釈する
        const acceptedAnswers = acceptedRaw
            ? acceptedRaw.split(/[,、]+/).map(s => s.trim()).filter(Boolean)
            : [];

        return {
            masterNumber,
            grade,
            coreProblemName,
            coreProblemNames,
            question,
            answer,
            acceptedAnswers,
            videoUrl,
        };
    });
}

export interface ParsedCoreProblemRow {
    masterNumber?: number;
    masterNumberRaw: string;
    name: string;
    lectureVideos: {
        title: string;
        url: string;
    }[];
}

/**
 * CoreProblem一括登録用のフォーマットでパース
 * カラム: [マスタNo] [CoreProblem名] [動画タイトル1] [動画URL1] ...
 */
export function parseCoreProblemTSV(input: string, skipHeader = true): ParsedCoreProblemRow[] {
    const rows = parseTSV(input);

    const dataRows = skipHeader
        ? excludeLeadingHeaderRow(rows, isCoreProblemHeaderRow)
        : rows;

    return dataRows.map((cols) => {
        const masterNumberRaw = (cols[0] || '').trim();
        const normalizedMasterNumber = masterNumberRaw.replace(/[^\d]/g, '');
        const masterNumberParsed = parseInt(normalizedMasterNumber, 10);
        const masterNumber = Number.isInteger(masterNumberParsed) ? masterNumberParsed : undefined;
        const name = (cols[1] || '').trim();

        const lectureVideos: { title: string; url: string }[] = [];
        for (let i = 2; i < cols.length; i += 2) {
            const title = (cols[i] || '').trim();
            const url = (cols[i + 1] || '').trim();
            if (title && url) {
                lectureVideos.push({ title, url });
            }
        }

        return {
            masterNumber,
            masterNumberRaw,
            name,
            lectureVideos,
        };
    });
}

function normalizeHeaderCell(value: string | undefined) {
    return (value ?? '').trim().replace(/\s+/g, '');
}

/**
 * 問題TSVのヘッダー形式を判定する。
 * ヘッダーを読まない場合や形式を判定できない場合は null を返し、
 * 呼び出し元では現行の新形式を既定値として扱う。
 */
function detectProblemHeaderFormat(cols: string[] | undefined) {
    if (!cols) {
        return null;
    }

    const firstCol = normalizeHeaderCell(cols[0]);
    const secondCol = normalizeHeaderCell(cols[1]);
    const thirdCol = normalizeHeaderCell(cols[2]);

    if (firstCol === 'マスタ内問題番号' || (secondCol === '学年' && thirdCol === 'CoreProblem名')) {
        return 'new';
    }

    if (firstCol === '学年' && secondCol === 'CoreProblem名') {
        return 'old';
    }

    return null;
}

function inferProblemRowFormat(cols: string[] | undefined) {
    if (!cols || cols.length === 0) {
        return null;
    }

    const firstCol = (cols[0] ?? '').trim();
    const secondCol = (cols[1] ?? '').trim();

    if (!firstCol && !secondCol) {
        return null;
    }

    if (looksLikeGrade(firstCol)) {
        return 'old';
    }

    if (looksLikeGrade(secondCol) || (!firstCol && secondCol.length > 0)) {
        return 'new';
    }

    if (firstCol.replace(/[^\d]/g, '').length > 0) {
        return 'new';
    }

    return null;
}

function looksLikeGrade(value: string) {
    const normalized = normalizeHeaderCell(value).replace(/第/g, '');

    return /^(?:小|中)(?:[1-6１-６一二三四五六])(?:年)?$/.test(normalized)
        || /^高(?:[1-3１-３一二三])(?:年)?$/.test(normalized)
        || /^(?:小学|中学)(?:[1-6１-６一二三四五六])年$/.test(normalized)
        || /^高校?(?:[1-3１-３一二三])年$/.test(normalized);
}

function excludeLeadingHeaderRow<T extends string[]>(rows: T[], isHeaderRow: (cols: string[]) => boolean): T[] {
    if (rows.length === 0) {
        return rows;
    }

    return isHeaderRow(rows[0]) ? rows.slice(1) : rows;
}

function isProblemHeaderRow(cols: string[]) {
    const firstCol = normalizeHeaderCell(cols[0]);
    const secondCol = normalizeHeaderCell(cols[1]);
    const thirdCol = normalizeHeaderCell(cols[2]);

    return firstCol === 'マスタ内問題番号'
        || (firstCol === '学年' && secondCol === 'CoreProblem名')
        || (secondCol === '学年' && thirdCol === 'CoreProblem名');
}

function isCoreProblemHeaderRow(cols: string[]) {
    const firstCol = normalizeHeaderCell(cols[0]);
    const secondCol = normalizeHeaderCell(cols[1]);

    return ['マスタNo', 'マスタNO', 'マスタ内問題番号'].includes(firstCol)
        && secondCol === 'CoreProblem名';
}
