/**
 * 抽出 JSON (scripts/data/_extracted/math-cp-*.json) からレビュー用 CSV を生成。
 *
 * 使い方:
 *   tsx scripts/data/_extracted/build-review-csv.ts [出力パス]
 *   出力パス省略時: tmp/math-review.csv
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const EXTRACTED_DIR = resolve(__dirname);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_OUTPUT = resolve(REPO_ROOT, 'tmp', 'math-review.csv');

interface ExtractedFile {
    coreProblem: {
        masterNumber: number;
        name: string;
        grade: '中1';
        unitGroup: string;
    };
    problems: Array<{
        source: '例題' | '確認問題';
        checkIndex: number;
        subIndex: string;
        question: string;
        answer: string;
        acceptedAnswers?: string[];
        difficulty: 'basic' | 'standard' | 'advanced';
        designNote?: string;
    }>;
}

function csvEscape(s: string | number | undefined | null): string {
    const str = String(s ?? '');
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function loadAll(): ExtractedFile[] {
    return readdirSync(EXTRACTED_DIR)
        .filter((f) => /^math-cp-\d+\.json$/.test(f))
        .map((f) => JSON.parse(readFileSync(resolve(EXTRACTED_DIR, f), 'utf-8')) as ExtractedFile)
        .sort((a, b) => a.coreProblem.masterNumber - b.coreProblem.masterNumber);
}

function main() {
    const outPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT;
    const files = loadAll();

    const header = [
        'customId',
        'cpMaster',
        'cpName',
        'unitGroup',
        'source',
        'checkIndex',
        'subIndex',
        'difficulty',
        'question',
        'answer',
        'acceptedAnswers',
        'designNote',
    ];

    const rows: string[][] = [header];
    let runningCustomId = 1;

    for (const f of files) {
        const cp = f.coreProblem;
        const sortedProblems = [...f.problems].sort((a, b) => {
            if (a.source !== b.source) return a.source === '例題' ? -1 : 1;
            if (a.checkIndex !== b.checkIndex) return a.checkIndex - b.checkIndex;
            return a.subIndex.localeCompare(b.subIndex, 'ja');
        });
        for (const p of sortedProblems) {
            rows.push([
                `M-${runningCustomId}`,
                String(cp.masterNumber),
                cp.name,
                cp.unitGroup,
                p.source,
                String(p.checkIndex),
                p.subIndex,
                p.difficulty,
                p.question ?? '',
                p.answer ?? '',
                (p.acceptedAnswers ?? []).join(' | '),
                p.designNote ?? '',
            ]);
            runningCustomId += 1;
        }
    }

    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `\uFEFF${csv}`, 'utf-8');

    console.log(`[build-review-csv] ${rows.length - 1} 行を ${outPath} に出力しました`);
    console.log(`[build-review-csv] CP=${files.length} 件`);
}

main();
