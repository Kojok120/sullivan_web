/**
 * 抽出 JSON (scripts/data/_extracted/math-cp-*.json) を統合して
 * scripts/data/math-problems-dev.ts を 74CP 版に再生成するスクリプト。
 *
 * 使い方:
 *   tsx scripts/data/_extracted/build-math-data.ts
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXTRACTED_DIR = resolve(__dirname);
const OUTPUT_PATH = resolve(__dirname, '..', 'math-problems-dev.ts');

type Difficulty = 'basic' | 'standard' | 'advanced';
type ProblemTypeName = 'SHORT_TEXT' | 'GEOMETRY' | 'GRAPH_DRAW';

interface ExtractedCoreProblem {
    masterNumber: number;
    name: string;
    grade: '中1';
    unitGroup: string;
}

interface ExtractedProblem {
    source: '例題' | '確認問題';
    checkIndex: number;
    subIndex: string;
    question: string;
    answer: string;
    acceptedAnswers?: string[];
    difficulty: Difficulty;
    designNote?: string;
    figure?: unknown;
}

interface ExtractedFile {
    coreProblem: ExtractedCoreProblem;
    problems: ExtractedProblem[];
}

const UNIT_GROUP_TO_MEXT: Record<string, string> = {
    '正の数と負の数': '中1-A 数と式 正負の数',
    '加法と減法': '中1-A 数と式 正負の数 (加法と減法)',
    '乗法と除法': '中1-A 数と式 正負の数 (乗法と除法)',
    '四則:素因数分解': '中1-A 数と式 正負の数 (四則・素因数分解)',
    '文字式の表し方': '中1-A 数と式 文字と式 (表し方)',
    '数量の表し方': '中1-A 数と式 文字と式 (数量の表し方)',
    '文字式の計算': '中1-A 数と式 文字と式 (計算)',
    '文字式の利用': '中1-A 数と式 文字と式 (利用)',
    '1次方程式の解き方': '中1-A 数と式 方程式 (解き方)',
    '1次方程式の利用': '中1-A 数と式 方程式 (利用)',
    '比例': '中1-C 関数 比例',
    '座標とグラフ': '中1-C 関数 座標とグラフ',
    '反比例': '中1-C 関数 反比例',
    '比例と反比例の利用': '中1-C 関数 比例・反比例の利用',
};

function loadExtractedFiles(): ExtractedFile[] {
    const entries = readdirSync(EXTRACTED_DIR)
        .filter((f) => /^math-cp-\d+\.json$/.test(f));
    const files: ExtractedFile[] = [];
    for (const fileName of entries) {
        const raw = readFileSync(resolve(EXTRACTED_DIR, fileName), 'utf-8');
        const parsed = JSON.parse(raw) as ExtractedFile;
        if (!parsed.coreProblem || !Array.isArray(parsed.problems)) {
            throw new Error(`不正な JSON: ${fileName}`);
        }
        files.push(parsed);
    }
    files.sort((a, b) => a.coreProblem.masterNumber - b.coreProblem.masterNumber);
    return files;
}

function escapeStr(s: string): string {
    // テンプレートリテラルではなく通常の string literal で出力する。
    return s
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

function renderCoreProblems(files: ExtractedFile[]): string {
    const lines: string[] = ['export const CORE_PROBLEMS: CoreProblemDef[] = ['];
    for (const f of files) {
        const cp = f.coreProblem;
        const mext = UNIT_GROUP_TO_MEXT[cp.unitGroup] ?? `中1 ${cp.unitGroup}`;
        lines.push('    {');
        lines.push(`        masterNumber: ${cp.masterNumber},`);
        lines.push(`        name: '${escapeStr(cp.name)}',`);
        lines.push(`        grade: '中1',`);
        lines.push(`        mextReference: '${escapeStr(mext)}',`);
        lines.push(`        description: '大単元: ${escapeStr(cp.unitGroup)} / 小単元: ${escapeStr(cp.name)}',`);
        lines.push('    },');
    }
    lines.push('];');
    return lines.join('\n');
}

function difficultyOrder(d: Difficulty): number {
    return d === 'basic' ? 0 : d === 'standard' ? 1 : 2;
}

function sourceOrder(s: '例題' | '確認問題'): number {
    return s === '例題' ? 0 : 1;
}

function renderMathProblems(files: ExtractedFile[]): string {
    const lines: string[] = ['export const MATH_PROBLEMS: MathProblemDef[] = ['];

    for (const f of files) {
        const cp = f.coreProblem;
        const mext = UNIT_GROUP_TO_MEXT[cp.unitGroup] ?? `中1 ${cp.unitGroup}`;
        const sortedProblems = [...f.problems].sort((a, b) => {
            const sd = sourceOrder(a.source) - sourceOrder(b.source);
            if (sd !== 0) return sd;
            const cd = a.checkIndex - b.checkIndex;
            if (cd !== 0) return cd;
            return a.subIndex.localeCompare(b.subIndex, 'ja');
        });
        if (sortedProblems.length === 0) continue;

        lines.push(`    // ---------- 単元 ${cp.masterNumber}: ${cp.name} (${cp.unitGroup}) ----------`);

        for (const p of sortedProblems) {
            const title = `${cp.name} ${p.source}${p.checkIndex}-${p.subIndex}`;
            const accepted = (p.acceptedAnswers ?? []).map((a) => `'${escapeStr(a)}'`).join(', ');
            const designNote = p.designNote ? p.designNote : '';
            lines.push('    {');
            lines.push(`        unitMasterNumber: ${cp.masterNumber},`);
            lines.push(`        difficulty: '${p.difficulty}',`);
            lines.push(`        problemType: 'SHORT_TEXT',`);
            lines.push(`        grade: '中1',`);
            lines.push(`        title: '${escapeStr(title)}',`);
            lines.push(`        question: '${escapeStr(p.question)}',`);
            lines.push(`        answer: '${escapeStr(p.answer)}',`);
            lines.push(`        acceptedAnswers: [${accepted}],`);
            lines.push(`        mextReference: '${escapeStr(mext)}',`);
            if (p.figure) {
                const figureJson = JSON.stringify(p.figure, null, 8)
                    .split('\n')
                    .map((line, idx) => (idx === 0 ? line : `        ${line}`))
                    .join('\n');
                lines.push(`        figure: ${figureJson},`);
            }
            if (designNote) {
                lines.push(`        designNote: '${escapeStr(designNote)}',`);
            } else {
                lines.push(`        designNote: '${escapeStr(`${p.source}${p.checkIndex}-${p.subIndex}`)}',`);
            }
            lines.push('    },');
        }
    }
    lines.push('];');
    return lines.join('\n');
}

function buildFileContent(files: ExtractedFile[]): string {
    const totalProblems = files.reduce((s, f) => s + f.problems.length, 0);

    const header = `/**
 * 数学 (中1) DEV 投入用データ。
 *
 * 生成元: scripts/data/_extracted/math-cp-*.json (vision OCR 抽出データ)
 * 生成スクリプト: scripts/data/_extracted/build-math-data.ts
 *
 * 出典: 中学校学習指導要領（平成29年告示）第2章 第3節 数学
 *   https://www.mext.go.jp/a_menu/shotou/new-cs/youryou/chu/su.htm
 *
 * CoreProblem: ${files.length} 件
 * Problem: ${totalProblems} 件
 *
 * 注意: このファイルは build-math-data.ts により再生成される。手動編集は再生成で上書きされる可能性がある。
 */

export type Grade = '中1' | '中2' | '中3';

export type Difficulty = 'basic' | 'standard' | 'advanced';

export type ProblemTypeName = 'SHORT_TEXT' | 'GEOMETRY' | 'GRAPH_DRAW';

export interface CoreProblemDef {
    masterNumber: number;
    name: string;
    grade: Grade;
    mextReference: string;
    description: string;
}

export interface MathProblemDef {
    unitMasterNumber: number;
    difficulty: Difficulty;
    problemType: ProblemTypeName;
    grade: Grade;
    title?: string;
    question: string;
    answer: string;
    acceptedAnswers?: string[];
    mextReference: string;
    /**
     * GeoGebra 連携を廃止したため、figure フィールドはレガシーデータ保持用。
     * 描画には使われない。新規データでは設定しないこと。
     */
    figure?: Record<string, unknown>;
    /** 採点や復習にあたっての設計メモ。CSV 出力に含める。 */
    designNote?: string;
}

`;

    const footer = `

export function getCoreProblemByMaster(masterNumber: number): CoreProblemDef {
    const found = CORE_PROBLEMS.find((cp) => cp.masterNumber === masterNumber);
    if (!found) {
        throw new Error(\`未定義の masterNumber が参照されました: \${masterNumber}\`);
    }
    return found;
}

export function summarizeProblemDistribution() {
    const byUnit = new Map<number, number>();
    const byType = new Map<ProblemTypeName, number>();
    const byGrade = new Map<Grade, number>();
    const byDifficulty = new Map<Difficulty, number>();

    for (const problem of MATH_PROBLEMS) {
        byUnit.set(problem.unitMasterNumber, (byUnit.get(problem.unitMasterNumber) ?? 0) + 1);
        byType.set(problem.problemType, (byType.get(problem.problemType) ?? 0) + 1);
        byGrade.set(problem.grade, (byGrade.get(problem.grade) ?? 0) + 1);
        byDifficulty.set(problem.difficulty, (byDifficulty.get(problem.difficulty) ?? 0) + 1);
    }

    return { byUnit, byType, byGrade, byDifficulty, total: MATH_PROBLEMS.length };
}
`;

    return `${header}${renderCoreProblems(files)}\n\n${renderMathProblems(files)}${footer}`;
}

function main() {
    const files = loadExtractedFiles();
    if (files.length === 0) {
        throw new Error(`抽出 JSON が見つかりません: ${EXTRACTED_DIR}`);
    }
    const masterNumbers = files.map((f) => f.coreProblem.masterNumber);
    const dupes = masterNumbers.filter((n, i) => masterNumbers.indexOf(n) !== i);
    if (dupes.length > 0) {
        throw new Error(`masterNumber 重複: ${[...new Set(dupes)].join(', ')}`);
    }
    const missing: number[] = [];
    for (let i = 1; i <= 74; i += 1) {
        if (!masterNumbers.includes(i)) missing.push(i);
    }
    if (missing.length > 0) {
        console.warn(`[warn] 1〜74 のうち未抽出の masterNumber: ${missing.join(', ')}`);
    }

    const content = buildFileContent(files);
    writeFileSync(OUTPUT_PATH, content, 'utf-8');

    const totalProblems = files.reduce((s, f) => s + f.problems.length, 0);
    console.log(`[build-math-data] CP=${files.length} 件 / Problem=${totalProblems} 件 を ${OUTPUT_PATH} に書き出しました`);
    console.log('[build-math-data] CP別件数:');
    for (const f of files) {
        console.log(`  #${f.coreProblem.masterNumber} ${f.coreProblem.name}: ${f.problems.length} 問`);
    }
}

main();
