/**
 * 編集対応が必要と私が triage した B/C/D カテゴリの figure-hint 問題を CSV 出力する read-only スクリプト。
 *
 * 入力: 直近の audit-legacy-figure-{env}-*.json （figure-hint-without-directive の検出リスト）
 *       + 本ファイル先頭の TRIAGE_MAP（私の手動分類）
 * 出力: tmp/triage-bcd-{env}-{ts}.csv
 *
 * 列:
 *   customId, subject, triageCategory, triageNote, keywords,
 *   publishedRevisionStatus, hasNumberlineTemplate, question, answer, answerTemplate,
 *   structuredText
 *
 * triageCategory:
 *   B-geometry            … [[geometry]] が必要そう
 *   C-coordplane          … [[coordplane]] が必要そう
 *   C-answertable         … [[answertable]] が必要そう
 *   C-coordplane+table    … 関数の表とグラフ両方
 *   D-numberline-marks    … [[numberline]] でカスタム marks が必要
 *
 * このスクリプトは DB を一切書き換えない。
 *
 * 使い方:
 *   tsx scripts/dump-triage-bcd-csv.ts                       # .env.DEV
 *   tsx scripts/dump-triage-bcd-csv.ts --env production      # .env.PRODUCTION
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

interface TriageEntry {
    customId: string;
    category: 'B-geometry' | 'C-coordplane' | 'C-answertable' | 'C-coordplane+table' | 'D-numberline-marks';
    note: string;
}

/**
 * 私が dump-figure-hint-content の本文を読んで判断した編集必要リスト。
 * 範囲指定の customId はあとで expandRange で展開する。
 * 監査結果に出ていない customId は CSV から自動的に落ちる（重複登録があっても OK）。
 */
const TRIAGE_RANGES: Array<{ from: number; to: number; prefix: string; entry: Omit<TriageEntry, 'customId'> }> = [
    // B-geometry
    { from: 1068, to: 1108, prefix: 'M-', entry: { category: 'B-geometry', note: '角度求値（図必要）' } },
    { from: 1135, to: 1165, prefix: 'M-', entry: { category: 'B-geometry', note: '合同/二等辺三角形' } },
    { from: 1758, to: 1779, prefix: 'M-', entry: { category: 'B-geometry', note: '平行線・線分比' } },
    { from: 1782, to: 1785, prefix: 'M-', entry: { category: 'B-geometry', note: '角の二等分線' } },
    { from: 1822, to: 1830, prefix: 'M-', entry: { category: 'B-geometry', note: '円周角' } },
    { from: 1852, to: 1862, prefix: 'M-', entry: { category: 'B-geometry', note: '三平方の定理' } },
    { from: 1882, to: 1885, prefix: 'M-', entry: { category: 'B-geometry', note: '特殊三角形' } },
    { from: 1887, to: 1892, prefix: 'M-', entry: { category: 'B-geometry', note: '円と接線' } },
    { from: 1907, to: 1915, prefix: 'M-', entry: { category: 'B-geometry', note: '立体の対角線' } },
    // C-coordplane / answertable
    { from: 1679, to: 1687, prefix: 'M-', entry: { category: 'C-coordplane+table', note: '関数の表＋グラフ' } },
    // D-numberline marks
    { from: 1464, to: 1466, prefix: 'M-', entry: { category: 'D-numberline-marks', note: 'A〜J を数直線上に配置' } },
];

const TRIAGE_SINGLES: TriageEntry[] = [
    { customId: 'M-528', category: 'C-coordplane', note: '座標平面プロット' },
    { customId: 'M-530', category: 'C-coordplane', note: '座標平面プロット' },
    { customId: 'M-533', category: 'C-coordplane+table', note: '関数の表＋グラフ' },
    { customId: 'M-534', category: 'C-coordplane+table', note: '関数の表＋グラフ' },
    { customId: 'M-549', category: 'C-answertable', note: '度数分布表' },
    { customId: 'M-550', category: 'C-answertable', note: '度数分布表' },
    { customId: 'M-551', category: 'C-answertable', note: '度数分布表' },
    { customId: 'M-760', category: 'C-answertable', note: '統計表' },
    { customId: 'M-761', category: 'C-answertable', note: '統計表' },
    { customId: 'M-1247', category: 'C-answertable', note: '四分位数の表' },
    { customId: 'M-1248', category: 'C-answertable', note: '四分位数の表' },
];

function buildTriageMap(): Map<string, TriageEntry> {
    const map = new Map<string, TriageEntry>();
    for (const range of TRIAGE_RANGES) {
        for (let i = range.from; i <= range.to; i += 1) {
            const customId = `${range.prefix}${i}`;
            map.set(customId, { customId, ...range.entry });
        }
    }
    for (const single of TRIAGE_SINGLES) {
        map.set(single.customId, single);
    }
    return map;
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

interface CliOptions {
    env: EnvName;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev' };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--env') {
            const value = argv[i + 1];
            if (value !== 'dev' && value !== 'production') {
                throw new Error(`--env には dev か production を指定してください (received: ${value ?? '(none)'})`);
            }
            opts.env = value;
            i += 1;
            continue;
        }
        if (arg?.startsWith('--')) {
            throw new Error(`未知のオプション: ${arg}`);
        }
    }
    return opts;
}

function describeDatabaseUrl(databaseUrl: string | undefined) {
    if (!databaseUrl) return '(未設定)';
    try {
        const url = new URL(databaseUrl);
        const dbName = url.pathname.replace(/^\//, '') || '(no-db)';
        return `${url.protocol}//${url.username || '(no-user)'}@${url.host}/${dbName}`;
    } catch {
        return '(parse-error)';
    }
}

function extractStructuredText(structuredContent: unknown): string {
    if (!structuredContent || typeof structuredContent !== 'object' || Array.isArray(structuredContent)) return '';
    const blocks = (structuredContent as { blocks?: unknown[] }).blocks;
    if (!Array.isArray(blocks)) return '';
    const lines: string[] = [];
    for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const block = b as Record<string, unknown>;
        switch (block.type) {
            case 'paragraph':
                if (typeof block.text === 'string') lines.push(block.text);
                break;
            case 'katexInline':
            case 'katexDisplay':
                if (typeof block.latex === 'string') lines.push(`[KaTeX] ${block.latex}`);
                break;
            case 'directive':
                if (typeof block.source === 'string') lines.push(`[Directive] ${block.source}`);
                break;
            case 'table':
                lines.push('[table block]');
                break;
            case 'image':
            case 'svg':
                lines.push(`[${block.type} block]`);
                break;
            default:
                if (typeof block.type === 'string') lines.push(`[${block.type} block]`);
        }
    }
    return lines.join('\n');
}

/**
 * RFC 4180 準拠の CSV エスケープ。
 * カンマ・改行・ダブルクォートのいずれかを含む場合は `"..."` で囲み、内部の `"` は `""` に置換する。
 */
function csvEscape(value: string | null | undefined): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    console.log('--- triage B/C/D CSV ダンプ (read-only) ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);

    const triageMap = buildTriageMap();
    console.log(`triage map: ${triageMap.size} 件 (customId 範囲展開後)`);

    const prisma = await loadPrisma();
    try {
        const customIds = [...triageMap.keys()];
        const problems = await prisma.problem.findMany({
            where: { customId: { in: customIds } },
            select: {
                id: true,
                customId: true,
                question: true,
                answer: true,
                publishedRevisionId: true,
                subject: { select: { name: true } },
            },
        });

        const publishedRevisionIds = problems.map((p) => p.publishedRevisionId).filter((id): id is string => !!id);
        const publishedRevisions = publishedRevisionIds.length > 0
            ? await prisma.problemRevision.findMany({
                where: { id: { in: publishedRevisionIds } },
                select: {
                    id: true,
                    revisionNumber: true,
                    status: true,
                    structuredContent: true,
                    answerSpec: true,
                },
            })
            : [];
        const revisionById = new Map(publishedRevisions.map((r) => [r.id, r]));

        // ヒットしなかった triage entry も report したい
        const foundCustomIds = new Set(problems.map((p) => p.customId));
        const missing = customIds.filter((id) => !foundCustomIds.has(id));
        if (missing.length > 0) {
            console.log(`\n[警告] DB に存在しない customId: ${missing.length} 件`);
            console.log(`  ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' ...' : ''}`);
        }

        // CSV 行構築
        const headers = [
            'customId', 'subject', 'triageCategory', 'triageNote', 'keywords',
            'publishedRevisionStatus', 'hasNumberlineTemplate',
            'question', 'answer', 'answerTemplate', 'structuredText',
        ];
        const rows: string[] = [headers.join(',')];

        // customId で自然順ソート
        problems.sort((a, b) => a.customId.localeCompare(b.customId, undefined, { numeric: true, sensitivity: 'base' }));

        let included = 0;
        for (const problem of problems) {
            const triage = triageMap.get(problem.customId);
            if (!triage) continue;

            const rev = problem.publishedRevisionId ? revisionById.get(problem.publishedRevisionId) : undefined;
            const structuredText = rev ? extractStructuredText(rev.structuredContent) : '';
            const answerSpec = rev?.answerSpec as { answerTemplate?: string } | undefined;
            const answerTemplate = answerSpec?.answerTemplate ?? '';
            const hasNumberlineTemplate = answerTemplate.includes('[[numberline');

            // figure-hint キーワードの簡易検出
            const figureHintKeywords = [
                '下のグラフ', '上のグラフ', '次のグラフ',
                '下の図', '上の図', '次の図',
                '下の表', '上の表', '次の表',
                '下記の表', '下記のグラフ', '下記の数直線',
                '座標平面', '数直線',
            ];
            const matchedKws = figureHintKeywords.filter((k) => problem.question.includes(k));

            const cells = [
                problem.customId,
                problem.subject.name,
                triage.category,
                triage.note,
                matchedKws.join(';'),
                rev ? `${rev.status} (rev${rev.revisionNumber})` : '(no-published)',
                hasNumberlineTemplate ? 'TRUE' : 'FALSE',
                problem.question,
                problem.answer ?? '',
                answerTemplate,
                structuredText,
            ];
            rows.push(cells.map(csvEscape).join(','));
            included += 1;
        }

        const outDir = resolve(__dirname, '..', 'tmp');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const outPath = resolve(outDir, `triage-bcd-${opts.env}-${ts}.csv`);
        // Excel での文字化け対策に BOM を付ける
        writeFileSync(outPath, '\uFEFF' + rows.join('\n'), 'utf8');
        console.log(`\n書き出し: ${outPath}`);
        console.log(`  triage 対象 (DB ヒット): ${included} 件`);
        console.log(`  triage 対象 (DB ミス):   ${missing.length} 件`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
