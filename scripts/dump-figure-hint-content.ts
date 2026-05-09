/**
 * audit-legacy-figure-content.ts で `figure-hint-without-directive` に分類された問題
 * （= 自然文に「下の表」「座標平面」「数直線」等の図キーワードを含むが
 *   新 DSL ([[numberline]] / [[coordplane]] / [[answertable]] / [[geometry]]) を含まない問題）
 * の問題文・解答・answerTemplate を Markdown にダンプする読み取り専用スクリプト。
 *
 * ダンプ後に開発者がレビューして「本当に図の差し替えが必要か / それとも単なる文中の言及か」を
 * 個別判断するための入力データを作るのが目的。
 *
 * 使い方:
 *   tsx scripts/dump-figure-hint-content.ts                       # .env.DEV
 *   tsx scripts/dump-figure-hint-content.ts --env production      # .env.PRODUCTION
 *   tsx scripts/dump-figure-hint-content.ts --subject 数学         # 教科で絞る
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

const KNOWN_DIRECTIVE_OPENERS = ['[[numberline', '[[coordplane', '[[answertable', '[[geometry'] as const;

const FIGURE_HINT_KEYWORDS = [
    '下のグラフ', '上のグラフ', '次のグラフ',
    '下の図', '上の図', '次の図',
    '下の表', '上の表', '次の表',
    '下記の表', '下記のグラフ', '下記の数直線',
    '座標平面', '数直線',
] as const;

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
    subjectName: string | null;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', subjectName: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case '--env': {
                const value = argv[i + 1];
                if (value !== 'dev' && value !== 'production') {
                    throw new Error(`--env には dev か production を指定してください (received: ${value ?? '(none)'})`);
                }
                opts.env = value;
                i += 1;
                break;
            }
            case '--subject':
                opts.subjectName = argv[i + 1] ?? null;
                i += 1;
                break;
            default:
                if (arg?.startsWith('--')) {
                    throw new Error(`未知のオプション: ${arg}`);
                }
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

function containsKnownDirective(text: string): boolean {
    return KNOWN_DIRECTIVE_OPENERS.some((opener) => text.includes(opener));
}

function matchedKeywords(text: string): string[] {
    return FIGURE_HINT_KEYWORDS.filter((kw) => text.includes(kw));
}

/**
 * publishedRevision の structuredContent から本文として表示されるテキストを抜き出す。
 * paragraph / katex / table / directive ブロックを軽く要約して返す。
 */
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

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    console.log('--- figure-hint コンテンツダンプ (read-only) ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);

    const prisma = await loadPrisma();
    try {
        const where = opts.subjectName ? { subject: { name: opts.subjectName } } : {};
        const problems = await prisma.problem.findMany({
            where,
            select: {
                id: true,
                customId: true,
                question: true,
                answer: true,
                publishedRevisionId: true,
                subject: { select: { name: true } },
            },
        });
        // problemId に紐づく publishedRevision だけを別クエリで取って Map にする。
        // findMany の include だと「publishedRevision なし」も含めると null チェックが煩雑になる。
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

        const targets = problems
            .filter((p) => !containsKnownDirective(p.question))
            .map((p) => {
                const kws = matchedKeywords(p.question);
                if (kws.length === 0) return null;
                return { problem: p, keywords: kws };
            })
            .filter((x): x is { problem: typeof problems[number]; keywords: string[] } => x !== null);

        console.log(`\n対象 figure-hint 問題: ${targets.length} 件 (全 Problem ${problems.length} 件中)`);

        // Subject ごとにまとめて Markdown 出力
        const bySubject = new Map<string, typeof targets>();
        for (const t of targets) {
            const key = t.problem.subject.name;
            const list = bySubject.get(key) ?? [];
            list.push(t);
            bySubject.set(key, list);
        }

        const md: string[] = [];
        md.push(`# figure-hint コンテンツダンプ`);
        md.push('');
        md.push(`- env: ${opts.env}`);
        md.push(`- 生成: ${new Date().toISOString()}`);
        md.push(`- 対象件数: ${targets.length}`);
        md.push(`- 検出キーワード: ${FIGURE_HINT_KEYWORDS.join(' / ')}`);
        md.push('');
        md.push('各問題ごとに「Problem.question (legacy)」「publishedRevision.structuredContent から抽出した本文」「Problem.answer」「answerSpec.answerTemplate」を併記する。');
        md.push('検出キーワードがあっても、本当に図/表が必要かは個別判断。');
        md.push('');

        for (const subject of [...bySubject.keys()].sort()) {
            const items = bySubject.get(subject)!;
            md.push(`## ${subject} (${items.length} 件)`);
            md.push('');
            // customId 自然順ソート
            items.sort((a, b) => a.problem.customId.localeCompare(b.problem.customId, undefined, { numeric: true, sensitivity: 'base' }));
            for (const { problem, keywords } of items) {
                const rev = problem.publishedRevisionId ? revisionById.get(problem.publishedRevisionId) : undefined;
                const structuredText = rev ? extractStructuredText(rev.structuredContent) : '';
                const answerSpecRaw = rev?.answerSpec as
                    | { correctAnswer?: unknown; acceptedAnswers?: unknown; answerTemplate?: unknown }
                    | undefined;
                const answerSpec = answerSpecRaw
                    ? {
                          correctAnswer:
                              typeof answerSpecRaw.correctAnswer === 'string' ? answerSpecRaw.correctAnswer : '',
                          acceptedAnswers: Array.isArray(answerSpecRaw.acceptedAnswers)
                              ? answerSpecRaw.acceptedAnswers.filter((v): v is string => typeof v === 'string')
                              : [],
                          answerTemplate:
                              typeof answerSpecRaw.answerTemplate === 'string' ? answerSpecRaw.answerTemplate : '',
                      }
                    : undefined;

                md.push(`### ${problem.customId} (problemId=${problem.id})`);
                md.push('');
                md.push(`- 検出キーワード: ${keywords.join(', ')}`);
                md.push(`- publishedRevision: ${rev ? `rev${rev.revisionNumber} (${rev.status})` : '(なし)'}`);
                md.push('');
                md.push(`**Problem.question (legacy text):**`);
                md.push('```');
                md.push(problem.question);
                md.push('```');
                md.push('');
                if (structuredText) {
                    md.push(`**publishedRevision.structuredContent (extracted):**`);
                    md.push('```');
                    md.push(structuredText);
                    md.push('```');
                    md.push('');
                }
                md.push(`**Problem.answer:** \`${problem.answer ?? '(null)'}\``);
                md.push('');
                if (answerSpec) {
                    md.push(`**answerSpec.correctAnswer:** \`${answerSpec.correctAnswer}\``);
                    if (answerSpec.acceptedAnswers.length > 0) {
                        md.push(`**answerSpec.acceptedAnswers:** ${answerSpec.acceptedAnswers.map((a) => `\`${a}\``).join(', ')}`);
                    }
                    if (answerSpec.answerTemplate) {
                        md.push(`**answerSpec.answerTemplate:**`);
                        md.push('```');
                        md.push(answerSpec.answerTemplate);
                        md.push('```');
                    }
                    md.push('');
                }
                md.push('---');
                md.push('');
            }
        }

        const outDir = resolve(__dirname, '..', 'tmp');
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const outPath = resolve(outDir, `figure-hint-content-${opts.env}-${ts}.md`);
        writeFileSync(outPath, md.join('\n'), 'utf8');
        console.log(`\n書き出し: ${outPath}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
