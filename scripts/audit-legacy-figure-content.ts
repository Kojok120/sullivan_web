/**
 * 既存 Problem / ProblemRevision / ProblemAsset を読み出し、
 * PR #150 で導入された新しい DSL 図形システム（[[numberline]] / [[coordplane]] /
 * [[answertable]] / [[geometry]]）の観点でマイグレーション対象を可視化する。
 *
 * このスクリプトは **読み取り専用** で、DB を一切書き換えない。
 *
 * 使い方:
 *   tsx scripts/audit-legacy-figure-content.ts                       # .env.DEV
 *   tsx scripts/audit-legacy-figure-content.ts --env production      # .env.PRODUCTION
 *   tsx scripts/audit-legacy-figure-content.ts --subject 数学         # 特定 Subject に絞る
 *   tsx scripts/audit-legacy-figure-content.ts --revision-scope all  # SUPERSEDED 含めて全 revision を見る
 *
 * 出力:
 *   - stdout に集計
 *   - tmp/audit-legacy-figure-{env}-{timestamp}.json に詳細
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAnswerTableDirective } from '../src/lib/answer-table-svg';
import { parseCoordPlaneDirective } from '../src/lib/coord-plane-svg';
import { parseGeometryDirective } from '../src/lib/geometry-svg';
import { parseNumberLineDirective } from '../src/lib/number-line-svg';

type EnvName = 'dev' | 'production';
type RevisionScope = 'published' | 'all';

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
    revisionScope: RevisionScope;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', subjectName: null, revisionScope: 'published' };
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
            case '--revision-scope': {
                const value = argv[i + 1];
                if (value !== 'published' && value !== 'all') {
                    throw new Error(`--revision-scope には published か all を指定してください (received: ${value ?? '(none)'})`);
                }
                opts.revisionScope = value;
                i += 1;
                break;
            }
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

// 新 DSL の opener。問題文 / answerTemplate のスキャンに使う。
const KNOWN_DIRECTIVE_OPENERS = ['[[numberline', '[[coordplane', '[[answertable', '[[geometry', '[[solid'] as const;

// 監査でだけ使う「自然文中で図に言及してそうなキーワード」。
// 自動変換は絶対にしないので false-positive 多めでも構わない。
const FIGURE_HINT_KEYWORDS = [
    '下のグラフ', '上のグラフ', '次のグラフ',
    '下の図', '上の図', '次の図',
    '下の表', '上の表', '次の表',
    '下記の表', '下記のグラフ', '下記の数直線',
    '座標平面', '数直線',
] as const;

function tryParseDirectiveByOpener(opener: string, body: string): boolean {
    switch (opener) {
        case '[[numberline':
            return parseNumberLineDirective(body) !== null;
        case '[[coordplane':
            return parseCoordPlaneDirective(body) !== null;
        case '[[answertable':
            return parseAnswerTableDirective(body) !== null;
        case '[[geometry':
            return parseGeometryDirective(body) !== null;
        default:
            return false;
    }
}

interface DirectiveSpan {
    opener: string;       // 例: "[[numberline"
    body: string;         // opener と "]]" を除いた中身
    raw: string;          // 元テキスト（"[[numberline ...]]" 全体）
    parses: boolean;      // 該当 parser が null を返さなかったか
}

/**
 * テキスト中の [[opener ...]] を全て列挙する。
 * known opener 以外のものも含めて返すので、
 * 旧 directive 名（例: [[numline / [[plot）の検出にも使える。
 */
function findDirectiveSpans(text: string): DirectiveSpan[] {
    if (!text) return [];
    const spans: DirectiveSpan[] = [];
    const re = /\[\[([A-Za-z][\w-]*)\b([^\]]*)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const opener = `[[${m[1]}`;
        const body = m[2].trimStart();
        const isKnown = (KNOWN_DIRECTIVE_OPENERS as readonly string[]).includes(opener);
        spans.push({
            opener,
            body,
            raw: m[0],
            parses: isKnown ? tryParseDirectiveByOpener(opener, body) : false,
        });
    }
    return spans;
}

interface BlockIssue {
    blockIndex: number;
    blockType: string;
    reasons: string[];   // 'legacy-type' | 'caption-key' | 'display-key'
}

/**
 * src/lib/structured-problem.ts の normalizeLegacyStructuredDocumentRaw が
 * silently drop している block 種別 / キーが残っていないかをチェック。
 */
function findLegacyBlocks(structuredContent: unknown): BlockIssue[] {
    if (!structuredContent || typeof structuredContent !== 'object' || Array.isArray(structuredContent)) return [];
    const blocks = (structuredContent as { blocks?: unknown[] }).blocks;
    if (!Array.isArray(blocks)) return [];
    const issues: BlockIssue[] = [];
    blocks.forEach((b, idx) => {
        if (!b || typeof b !== 'object') return;
        const block = b as Record<string, unknown>;
        const type = typeof block.type === 'string' ? block.type : '(unknown)';
        const reasons: string[] = [];
        if (type === 'caption' || type === 'graphAsset' || type === 'geometryAsset') {
            reasons.push('legacy-type');
        }
        if ('caption' in block) reasons.push('caption-key');
        if ('display' in block) reasons.push('display-key');
        if (reasons.length > 0) {
            issues.push({ blockIndex: idx, blockType: type, reasons });
        }
    });
    return issues;
}

interface AuditFinding {
    category:
        | 'geogebra-revision'
        | 'geogebra-asset'
        | 'legacy-block-in-structured'
        | 'invalid-answer-template'
        | 'invalid-directive-in-question'
        | 'unknown-directive-name'
        | 'figure-hint-without-directive';
    problemId: string;
    customId: string;
    subjectName: string;
    detail: Record<string, unknown>;
}

function summarize(findings: AuditFinding[]) {
    const summary: Record<string, number> = {};
    for (const f of findings) {
        summary[f.category] = (summary[f.category] ?? 0) + 1;
    }
    return summary;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    const databaseUrl = process.env.DATABASE_URL;
    console.log('--- 図形/DSL レガシー監査 (read-only) ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(databaseUrl)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const prisma = await loadPrisma();
    try {
        const where = opts.subjectName ? { subject: { name: opts.subjectName } } : {};

        // 走査範囲をまず Problem 単位で取り、関連する revision / asset を含めて引く。
        // 大規模 DB を想定するなら pagination を入れたいが、現状の問題数は数百〜数千オーダーなので
        // 一括取得で十分（メモリ負荷も軽い）。
        const problems = await prisma.problem.findMany({
            where,
            select: {
                id: true,
                customId: true,
                question: true,
                publishedRevisionId: true,
                subject: { select: { name: true } },
                revisions: {
                    select: {
                        id: true,
                        revisionNumber: true,
                        status: true,
                        structuredContent: true,
                        answerSpec: true,
                        authoringTool: true,
                        assets: {
                            select: { id: true, kind: true, fileName: true },
                        },
                    },
                },
            },
        });

        console.log(`\n対象 Problem: ${problems.length} 件`);

        const findings: AuditFinding[] = [];

        for (const p of problems) {
            const subjectName = p.subject.name;

            // 1) Problem.question の DSL チェック
            const questionSpans = findDirectiveSpans(p.question);
            for (const span of questionSpans) {
                const isKnown = (KNOWN_DIRECTIVE_OPENERS as readonly string[]).includes(span.opener);
                if (!isKnown) {
                    findings.push({
                        category: 'unknown-directive-name',
                        problemId: p.id,
                        customId: p.customId,
                        subjectName,
                        detail: { location: 'Problem.question', opener: span.opener, raw: span.raw.slice(0, 200) },
                    });
                } else if (!span.parses) {
                    findings.push({
                        category: 'invalid-directive-in-question',
                        problemId: p.id,
                        customId: p.customId,
                        subjectName,
                        detail: { opener: span.opener, raw: span.raw.slice(0, 200) },
                    });
                }
            }

            // 2) 自然文ヒント（自動変換しない、人間レビュー対象）
            //    既に DSL が含まれている問題は対象外（既に図がある＝対応済み）
            //    publishedRevision または最新 revision の structuredContent.blocks に
            //    directive ブロックがある場合も「対応済み」とみなす。
            if (questionSpans.length === 0) {
                const hits = FIGURE_HINT_KEYWORDS.filter((kw) => p.question.includes(kw));
                if (hits.length > 0) {
                    const hasStructuredDirective = p.revisions.some((rev) => {
                        const sc = rev.structuredContent;
                        if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return false;
                        const blocks = (sc as { blocks?: unknown }).blocks;
                        if (!Array.isArray(blocks)) return false;
                        return blocks.some((b) => b && typeof b === 'object' && (b as { type?: string }).type === 'directive');
                    });
                    if (!hasStructuredDirective) {
                        findings.push({
                            category: 'figure-hint-without-directive',
                            problemId: p.id,
                            customId: p.customId,
                            subjectName,
                            detail: { keywords: hits },
                        });
                    }
                }
            }

            // 3) Revision を走査（scope に応じて全部 or publishedRevisionId だけ）
            const revisions = opts.revisionScope === 'all'
                ? p.revisions
                : p.revisions.filter((r) => r.id === p.publishedRevisionId);

            for (const rev of revisions) {
                // 3-a) GeoGebra authoring
                if (rev.authoringTool === 'GEOGEBRA') {
                    findings.push({
                        category: 'geogebra-revision',
                        problemId: p.id,
                        customId: p.customId,
                        subjectName,
                        detail: { revisionId: rev.id, revisionNumber: rev.revisionNumber, status: rev.status },
                    });
                }

                // 3-b) GeoGebra asset
                for (const asset of rev.assets) {
                    if (asset.kind === 'GEOGEBRA_STATE') {
                        findings.push({
                            category: 'geogebra-asset',
                            problemId: p.id,
                            customId: p.customId,
                            subjectName,
                            detail: {
                                revisionId: rev.id,
                                revisionNumber: rev.revisionNumber,
                                assetId: asset.id,
                                fileName: asset.fileName,
                            },
                        });
                    }
                }

                // 3-c) structuredContent 内の旧 block / 旧キー
                const blockIssues = findLegacyBlocks(rev.structuredContent);
                for (const issue of blockIssues) {
                    findings.push({
                        category: 'legacy-block-in-structured',
                        problemId: p.id,
                        customId: p.customId,
                        subjectName,
                        detail: {
                            revisionId: rev.id,
                            revisionNumber: rev.revisionNumber,
                            blockIndex: issue.blockIndex,
                            blockType: issue.blockType,
                            reasons: issue.reasons,
                        },
                    });
                }

                // 3-d) answerSpec.answerTemplate の DSL バリデーション
                const answerSpec = rev.answerSpec;
                if (answerSpec && typeof answerSpec === 'object' && !Array.isArray(answerSpec)) {
                    const tmpl = (answerSpec as { answerTemplate?: unknown }).answerTemplate;
                    if (typeof tmpl === 'string' && tmpl.length > 0) {
                        const tmplSpans = findDirectiveSpans(tmpl);
                        for (const span of tmplSpans) {
                            const isKnown = (KNOWN_DIRECTIVE_OPENERS as readonly string[]).includes(span.opener);
                            if (!isKnown) {
                                findings.push({
                                    category: 'unknown-directive-name',
                                    problemId: p.id,
                                    customId: p.customId,
                                    subjectName,
                                    detail: {
                                        location: 'answerSpec.answerTemplate',
                                        revisionId: rev.id,
                                        opener: span.opener,
                                        raw: span.raw.slice(0, 200),
                                    },
                                });
                            } else if (!span.parses) {
                                findings.push({
                                    category: 'invalid-answer-template',
                                    problemId: p.id,
                                    customId: p.customId,
                                    subjectName,
                                    detail: {
                                        revisionId: rev.id,
                                        opener: span.opener,
                                        raw: span.raw.slice(0, 200),
                                        fullTemplate: tmpl.slice(0, 400),
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }

        // ----- 出力 -----
        const summary = summarize(findings);
        console.log('\n[集計] (category 別)');
        const sortedCats = Object.keys(summary).sort();
        if (sortedCats.length === 0) {
            console.log('  (見つからず)');
        } else {
            for (const cat of sortedCats) {
                console.log(`  ${cat}: ${summary[cat]}`);
            }
        }

        // 各カテゴリの先頭 3 件をサンプルとして表示
        console.log('\n[サンプル] (各カテゴリ先頭 3 件)');
        for (const cat of sortedCats) {
            const items = findings.filter((f) => f.category === cat).slice(0, 3);
            console.log(`  --- ${cat} ---`);
            for (const item of items) {
                const detailStr = JSON.stringify(item.detail);
                console.log(`    ${item.subjectName}/${item.customId} (problemId=${item.problemId}): ${detailStr}`);
            }
        }

        // tmp/ に詳細 JSON を吐き出す（gitignore 済み）
        const outDir = resolve(__dirname, '..', 'tmp');
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const outPath = resolve(outDir, `audit-legacy-figure-${opts.env}-${ts}.json`);
        const payload = {
            generatedAt: new Date().toISOString(),
            env: opts.env,
            options: opts,
            problemCount: problems.length,
            summary,
            findings,
        };
        writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`\n詳細レポートを書き出しました: ${outPath}`);
        console.log(`(問題件数=${problems.length}, 検出件数=${findings.length})`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
