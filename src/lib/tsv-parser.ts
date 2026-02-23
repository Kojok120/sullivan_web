/**
 * TSVパーサ - Excel/スプレッドシートからの貼り付けに対応
 * 引用符内の改行をサポート
 */
export function parseTSV(input: string): string[][] {
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
                    // Escaped quote
                    currentField += '"';
                    i += 2;
                } else {
                    // End of quoted field
                    inQuotes = false;
                    i++;
                }
            } else {
                currentField += char;
                i++;
            }
        } else {
            if (char === '"') {
                // Start of quoted field
                inQuotes = true;
                i++;
            } else if (char === '\t') {
                // Field separator
                currentRow.push(currentField.trim());
                currentField = '';
                i++;
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                // Row separator
                currentRow.push(currentField.trim());
                if (currentRow.some(cell => cell.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                i += (char === '\r' ? 2 : 1);
            } else if (char === '\r') {
                // Single CR as row separator
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

    // Don't forget the last field and row
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
    masterNumber?: number; // 新規: マスタ内問題番号
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

    // Skip header row if it contains "マスタ内問題番号" or similar
    const dataRows = skipHeader
        ? rows.filter(cols => {
            const firstCol = cols[0];
            return !firstCol?.includes('マスタ') && !firstCol?.includes('学年');
        })
        : rows;

    return dataRows.map(cols => {
        // New Format:
        // 0: MasterNumber, 1: Grade, 2: CoreProblem(s), 3: Question, 4: Answer, 5: Accepted (opt), 6: Video (opt)

        let masterNumber: number | undefined;
        if (cols[0]) {
            const parsed = parseInt(cols[0].replace(/[^\d]/g, ''), 10);
            if (!isNaN(parsed)) {
                masterNumber = parsed;
            }
        }

        const grade = cols[1] || '';
        const cpRaw = cols[2] || '';
        const question = cols[3] || '';
        const answer = cols[4] || '';
        const acceptedRaw = cols[5] || '';
        const videoUrl = cols[6] || '';

        // Parse CoreProblem names (can be comma or newline separated)
        const coreProblemNames = cpRaw.split(/[,\n、]+/).map(s => s.trim()).filter(Boolean);
        const coreProblemName = cpRaw; // raw value for single name case

        // Parse accepted answers (comma separated)
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
        ? rows.filter((cols) => {
            const firstCol = cols[0] || '';
            const secondCol = cols[1] || '';
            return !firstCol.includes('マスタ') && !secondCol.includes('CoreProblem');
        })
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
