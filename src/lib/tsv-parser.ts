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

    // Skip header row if it contains "学年" or "CoreProblem"
    const dataRows = skipHeader
        ? rows.filter(cols => {
            const firstCol = cols[0];
            return firstCol !== '学年' && !firstCol?.toLowerCase().includes('coreproblem');
        })
        : rows;

    return dataRows.map(cols => {
        // 0: Grade, 1: CoreProblem(s), 2: Question, 3: Answer, 4: Accepted (opt), 5: Video (opt)
        const grade = cols[0] || '';
        const cpRaw = cols[1] || '';
        const question = cols[2] || '';
        const answer = cols[3] || '';
        const acceptedRaw = cols[4] || '';
        const videoUrl = cols[5] || '';

        // Parse CoreProblem names (can be comma or newline separated)
        const coreProblemNames = cpRaw.split(/[,\n、]+/).map(s => s.trim()).filter(Boolean);
        const coreProblemName = cpRaw; // raw value for single name case

        // Parse accepted answers (comma separated)
        const acceptedAnswers = acceptedRaw
            ? acceptedRaw.split(/[,、]+/).map(s => s.trim()).filter(Boolean)
            : [];

        return {
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
