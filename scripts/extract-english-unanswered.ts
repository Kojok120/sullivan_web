/**
 * 英語問題のうち解答が未設定のものを抽出し、サブエージェント分割用バッチ JSON
 * として書き出す read-only スクリプト。
 *
 * 出力構造（既定: <repo>/.tmp/english-answers/）:
 *   manifest.json                            進捗管理（pending / generated / reviewed / applied）
 *   batch-001.json, batch-002.json, ...      50 問単位のバッチ（generation agent への入力）
 *   divergence.json                          Problem.answer と correctAnswer の片方だけ埋まる問題（要別タスク）
 *
 * 抽出条件:
 *   - subject.name = '英語'
 *   - status = 'PUBLISHED'
 *   - publishedRevisionId が NOT NULL
 *   - Problem.answer が NULL/空 かつ publishedRevision.correctAnswer も NULL/空
 *     （両方が同期して空 = 「未設定で同期済み」状態のみ対象）
 *
 * publish フローは ProblemRevision.correctAnswer から Problem.answer に片方向同期される
 * ため、書き込み時には両カラムを同一トランザクションで update する必要がある（apply 側）。
 *
 * 使い方:
 *   tsx scripts/extract-english-unanswered.ts --env dev
 *   tsx scripts/extract-english-unanswered.ts --env production --limit 100
 *   tsx scripts/extract-english-unanswered.ts --env production --batch-size 50
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

interface CliOptions {
    env: EnvName;
    limit: number | null;
    batchSize: number;
    outDir: string;
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        env: 'dev',
        limit: null,
        batchSize: 50,
        outDir: resolve(__dirname, '..', '.tmp', 'english-answers'),
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--env') {
            const v = argv[i + 1];
            if (v !== 'dev' && v !== 'production') {
                throw new Error(`--env には dev か production を指定してください (received: ${v ?? '(none)'})`);
            }
            opts.env = v;
            i += 1;
            continue;
        }
        if (arg === '--limit') {
            const v = argv[i + 1];
            const parsed = Number.parseInt(v ?? '', 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error('--limit は正の整数を指定してください');
            }
            opts.limit = parsed;
            i += 1;
            continue;
        }
        if (arg === '--batch-size') {
            const v = argv[i + 1];
            const parsed = Number.parseInt(v ?? '', 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error('--batch-size は正の整数を指定してください');
            }
            opts.batchSize = parsed;
            i += 1;
            continue;
        }
        if (arg === '--out-dir') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--out-dir の値が不正です');
            opts.outDir = resolve(v);
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

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

interface ExtractedItem {
    problemId: string;
    revisionId: string;
    customId: string;
    subjectName: string;
    grade: string | null;
    masterNumber: number | null;
    question: string;
    structuredContent: unknown;
}

interface DivergenceItem {
    problemId: string;
    revisionId: string;
    customId: string;
    problemAnswer: string;
    revisionCorrectAnswer: string;
}

interface BatchManifestEntry {
    batchId: string;
    fileName: string;
    count: number;
    status: 'pending' | 'generated' | 'reviewed' | 'applied';
}

interface Manifest {
    generatedAt: string;
    env: EnvName;
    totalCandidates: number;
    divergenceCount: number;
    batchSize: number;
    batches: BatchManifestEntry[];
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    console.log('--- 英語問題 未解答抽出 ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`オプション: ${JSON.stringify({ ...opts, outDir: opts.outDir })}`);

    const prisma = await loadPrisma();
    try {
        // 公開済みの英語問題で publishedRevision を持つものを全件取得し、
        // 「両方空」「片方のみ空 (= divergence)」「両方埋まっている (= skip)」を JS 側で振り分ける。
        // Prisma の関連テーブルへの OR 条件は型が複雑になるため、ここでは findMany 後に分類する。
        const problems = await prisma.problem.findMany({
            where: {
                subject: { name: '英語' },
                status: 'PUBLISHED',
                publishedRevisionId: { not: null },
            },
            select: {
                id: true,
                customId: true,
                question: true,
                answer: true,
                grade: true,
                masterNumber: true,
                publishedRevisionId: true,
                publishedRevision: {
                    select: {
                        id: true,
                        correctAnswer: true,
                        structuredContent: true,
                    },
                },
                subject: { select: { name: true } },
            },
            orderBy: [{ subjectId: 'asc' }, { customIdSortKey: 'asc' }],
        });

        const targets: ExtractedItem[] = [];
        const divergence: DivergenceItem[] = [];
        let bothFilled = 0;

        for (const p of problems) {
            const probAnswer = (p.answer ?? '').trim();
            const revCorrect = (p.publishedRevision?.correctAnswer ?? '').trim();
            const revisionId = p.publishedRevision?.id;
            if (!revisionId) continue;

            if (probAnswer === '' && revCorrect === '') {
                targets.push({
                    problemId: p.id,
                    revisionId,
                    customId: p.customId,
                    subjectName: p.subject.name,
                    grade: p.grade,
                    masterNumber: p.masterNumber,
                    question: p.question,
                    structuredContent: p.publishedRevision?.structuredContent ?? null,
                });
                continue;
            }
            if (probAnswer === '' || revCorrect === '') {
                divergence.push({
                    problemId: p.id,
                    revisionId,
                    customId: p.customId,
                    problemAnswer: probAnswer,
                    revisionCorrectAnswer: revCorrect,
                });
                continue;
            }
            bothFilled += 1;
        }

        const limited = opts.limit ? targets.slice(0, opts.limit) : targets;
        const batches = chunk(limited, opts.batchSize);

        mkdirSync(opts.outDir, { recursive: true });

        const manifestEntries: BatchManifestEntry[] = [];
        batches.forEach((items, i) => {
            const batchId = `batch-${String(i + 1).padStart(3, '0')}`;
            const fileName = `${batchId}.json`;
            writeFileSync(
                resolve(opts.outDir, fileName),
                `${JSON.stringify({ batchId, items }, null, 2)}\n`,
            );
            manifestEntries.push({ batchId, fileName, count: items.length, status: 'pending' });
        });

        if (divergence.length > 0) {
            writeFileSync(
                resolve(opts.outDir, 'divergence.json'),
                `${JSON.stringify({ generatedAt: new Date().toISOString(), env: opts.env, items: divergence }, null, 2)}\n`,
            );
        }

        const manifest: Manifest = {
            generatedAt: new Date().toISOString(),
            env: opts.env,
            totalCandidates: limited.length,
            divergenceCount: divergence.length,
            batchSize: opts.batchSize,
            batches: manifestEntries,
        };
        writeFileSync(
            resolve(opts.outDir, 'manifest.json'),
            `${JSON.stringify(manifest, null, 2)}\n`,
        );

        console.log('');
        console.log(`[extract] 公開済み英語問題: ${problems.length} 件`);
        console.log(`[extract]   ├─ 両方空 (対象): ${targets.length}${opts.limit ? ` (--limit ${opts.limit} 適用後 ${limited.length})` : ''}`);
        console.log(`[extract]   ├─ divergence (要別タスク): ${divergence.length}`);
        console.log(`[extract]   └─ 両方埋まっている (skip): ${bothFilled}`);
        console.log(`[extract] バッチ数: ${batches.length} (size=${opts.batchSize})`);
        console.log(`[extract] 出力先: ${opts.outDir}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
