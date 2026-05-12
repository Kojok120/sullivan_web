import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase D: 既存 ProblemRevision の `searchText` を埋め直すバックフィルスクリプト。
 *
 * Phase D マイグレーション (20260513000000_add_problem_revision_search_text) で
 * `ProblemRevision.searchText` を NULL で追加した後、本スクリプトで全 revision の
 * structuredContent / correctAnswer / acceptedAnswers から再計算して埋める。
 *
 * idempotent: 何度実行しても同じ値に収束する。
 *
 * 使い方:
 *   npx tsx scripts/backfill-revision-search-text.ts --env dev               # dry-run, 全件
 *   npx tsx scripts/backfill-revision-search-text.ts --env dev --yes         # DEV 実行
 *   npx tsx scripts/backfill-revision-search-text.ts --env production --yes  # PROD 実行
 *   npx tsx scripts/backfill-revision-search-text.ts --env dev --yes --limit 100
 *   npx tsx scripts/backfill-revision-search-text.ts --env dev --yes --only-null   # NULL のみ
 */

type EnvName = 'dev' | 'production';

type Args = {
    env: EnvName;
    apply: boolean;
    limit: number | null;
    onlyNull: boolean;
    batchSize: number;
    sleepMs: number;
};

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): Args {
    const apply = argv.includes('--yes');
    const onlyNull = argv.includes('--only-null');
    let env: EnvName | null = null;
    let limit: number | null = null;
    let batchSize = 200;
    let sleepMs = 20;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--env') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--env の値が不正です (dev | production)');
            if (v !== 'dev' && v !== 'production') throw new Error(`--env: ${v} (dev | production)`);
            env = v;
            i++;
        } else if (arg === '--limit') {
            const v = Number(argv[i + 1]);
            if (!Number.isFinite(v) || v <= 0) {
                throw new Error(`--limit には正の整数を指定してください: ${argv[i + 1]}`);
            }
            limit = Math.floor(v);
            i++;
        } else if (arg === '--batch-size') {
            const v = Number(argv[i + 1]);
            if (!Number.isFinite(v) || v <= 0) {
                throw new Error(`--batch-size には正の整数を指定してください: ${argv[i + 1]}`);
            }
            batchSize = Math.floor(v);
            i++;
        } else if (arg === '--sleep-ms') {
            const v = Number(argv[i + 1]);
            if (!Number.isFinite(v) || v < 0) {
                throw new Error(`--sleep-ms には 0 以上の整数を指定してください: ${argv[i + 1]}`);
            }
            sleepMs = Math.floor(v);
            i++;
        }
    }

    if (env === null) {
        throw new Error('--env を指定してください (dev | production)');
    }

    return { env, apply, limit, onlyNull, batchSize, sleepMs };
}

async function sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

async function loadExtractor() {
    const mod = await import('../src/lib/structured-problem');
    return mod.extractSearchTextFromRevision;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(args.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });
    console.log(`[backfill] env=${args.env} (loaded ${envFile})`);

    const prisma = await loadPrisma();
    const extractSearchTextFromRevision = await loadExtractor();

    try {
        await runBackfill(args, prisma, extractSearchTextFromRevision);
    } finally {
        await prisma.$disconnect();
    }
}

async function runBackfill(
    args: Args,
    prisma: Awaited<ReturnType<typeof loadPrisma>>,
    extractSearchTextFromRevision: Awaited<ReturnType<typeof loadExtractor>>,
): Promise<void> {
    const where = args.onlyNull ? { searchText: null } : {};

    const totalCount = await prisma.problemRevision.count({ where });
    console.log(`[backfill] 対象 ${totalCount} 件 ${args.onlyNull ? '(searchText IS NULL)' : '(全 revision)'}`);
    if (args.limit !== null) {
        console.log(`[backfill] --limit ${args.limit} で先頭から処理`);
    }
    if (!args.apply) {
        console.log('[backfill] dry-run。書き込みはしない。--yes で実行。');
    }

    let processed = 0;
    let updated = 0;
    let unchanged = 0;
    let cursor: string | undefined;
    const remainingCap = args.limit ?? Number.POSITIVE_INFINITY;

    while (processed < remainingCap) {
        const take = Math.min(args.batchSize, remainingCap - processed);
        const batch: { id: string; structuredContent: unknown; correctAnswer: string | null; acceptedAnswers: string[]; searchText: string | null }[] =
            await prisma.problemRevision.findMany({
                where,
                orderBy: { id: 'asc' },
                take,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                select: {
                    id: true,
                    structuredContent: true,
                    correctAnswer: true,
                    acceptedAnswers: true,
                    searchText: true,
                },
            });
        if (batch.length === 0) break;

        for (const revision of batch) {
            const next = extractSearchTextFromRevision({
                structuredContent: revision.structuredContent,
                correctAnswer: revision.correctAnswer,
                acceptedAnswers: revision.acceptedAnswers,
            });

            // searchText が NULL のまま残ると --only-null の where に毎回マッチしてしまうので、
            // 抽出結果が空文字でも DB 値が NULL なら必ず書き込む。null !== '' で判定するため
            // 生の DB 値 (null | string) を保持する。
            const prev = revision.searchText;
            if (prev === next) {
                unchanged += 1;
            } else if (args.apply) {
                await prisma.problemRevision.update({
                    where: { id: revision.id },
                    data: { searchText: next },
                });
                updated += 1;
                if (args.sleepMs > 0) {
                    await sleep(args.sleepMs);
                }
            } else {
                updated += 1;
            }
            processed += 1;
        }

        cursor = batch[batch.length - 1]!.id;
        if (processed % 500 === 0 || processed === remainingCap) {
            console.log(`[backfill] ${processed}/${totalCount} 件処理 (updated=${updated}, unchanged=${unchanged})`);
        }
        if (batch.length < take) break;
    }

    console.log('---');
    console.log(`[backfill] 完了`);
    console.log(`  処理: ${processed}`);
    console.log(`  更新: ${updated}${args.apply ? '' : ' (dry-run: 実書き込みなし)'}`);
    console.log(`  変化なし: ${unchanged}`);
}

main().catch((error) => {
    console.error('[backfill] 失敗:', error);
    process.exitCode = 1;
});
