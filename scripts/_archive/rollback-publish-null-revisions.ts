/**
 * publish-null-revisions.ts のロールバック用スクリプト。
 *
 * 復元処理 (1 問 1 トランザクション):
 *   1. Problem.publishedRevisionId === <revision id> であることを再確認
 *   2. Problem.publishedRevisionId = null に戻す
 *   3. revision.status = DRAFT, publishedAt = null に戻す
 *   4. (任意) 同じ problemId の他の revision に publish 前の状態 (DRAFT) が
 *      残っていれば触らない。SUPERSEDED に下げた revision は復元 _しない_
 *      (publish-null-revisions は publishedRevisionId が null だった問題が
 *      対象なので、SUPERSEDED 化される他 PUBLISHED は通常存在しない)
 *
 * 入力:
 *   --revision-ids id1,id2,id3        対象 revision を直接指定
 *   --file path/to/ids.txt            1 行 1 revision id の txt
 *   --from-failures-dir <dir>         publish-null/failures.csv は対象外
 *
 * 使い方 (例):
 *   tsx scripts/rollback-publish-null-revisions.ts --env production --revision-ids cmxxx,cmyyy --dry-run
 *   tsx scripts/rollback-publish-null-revisions.ts --env production --file .tmp/publish-null/rollback-ids.txt --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

interface CliOptions {
    env: EnvName;
    dryRun: boolean;
    revisionIds: string[];
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        env: 'dev',
        dryRun: true,
        revisionIds: [],
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
        if (arg === '--dry-run') {
            opts.dryRun = true;
            continue;
        }
        if (arg === '--yes' || arg === '-y') {
            opts.dryRun = false;
            continue;
        }
        if (arg === '--revision-ids') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--revision-ids の値が不正です');
            opts.revisionIds.push(
                ...v
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
            );
            i += 1;
            continue;
        }
        if (arg === '--file') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--file の値が不正です');
            const path = resolve(v);
            if (!existsSync(path)) throw new Error(`--file が存在しません: ${path}`);
            const lines = readFileSync(path, 'utf-8')
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !s.startsWith('#'));
            opts.revisionIds.push(...lines);
            i += 1;
            continue;
        }
        if (arg?.startsWith('--')) {
            throw new Error(`未知のオプション: ${arg}`);
        }
    }
    if (opts.revisionIds.length === 0) {
        throw new Error('--revision-ids か --file のいずれかで対象 revision を指定してください');
    }
    // 重複除去
    opts.revisionIds = Array.from(new Set(opts.revisionIds));
    return opts;
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
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

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    console.log('--- rollback-publish-null-revisions ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`mode: ${opts.dryRun ? 'dry-run' : 'apply'}`);
    console.log(`対象 revision id 数: ${opts.revisionIds.length}`);

    const prisma = await loadPrisma();
    try {
        const revisions = await prisma.problemRevision.findMany({
            where: { id: { in: opts.revisionIds } },
            select: {
                id: true,
                status: true,
                publishedAt: true,
                problem: {
                    select: {
                        id: true,
                        customId: true,
                        publishedRevisionId: true,
                        subject: { select: { name: true } },
                    },
                },
            },
        });

        const missing = opts.revisionIds.filter((id) => !revisions.some((r) => r.id === id));
        if (missing.length > 0) {
            console.log(`\n[warn] DB に存在しない revision id: ${missing.length} 件 (先頭 5)`);
            for (const id of missing.slice(0, 5)) console.log(`  - ${id}`);
        }

        const ready = revisions.filter(
            (r) => r.status === 'PUBLISHED' && r.problem.publishedRevisionId === r.id,
        );
        const notReady = revisions.filter((r) => !ready.includes(r));

        console.log('');
        console.log(`[scan] PUBLISHED かつ Problem.publishedRevisionId が一致: ${ready.length}`);
        console.log(`[scan] 状態が想定と異なる: ${notReady.length}`);
        if (notReady.length > 0) {
            console.log('[scan] 想定外 (先頭 5 件):');
            for (const r of notReady.slice(0, 5)) {
                console.log(
                    `  - ${r.problem.subject.name} ${r.problem.customId} rev=${r.id} ` +
                        `revStatus=${r.status} problem.publishedRevisionId=${r.problem.publishedRevisionId ?? 'null'}`,
                );
            }
        }
        if (opts.dryRun) {
            console.log('\n--dry-run のため DB 書き込みは行いません');
            return;
        }

        if (ready.length === 0) {
            console.log('\nロールバック対象 0 件のため終了します');
            return;
        }

        let succeeded = 0;
        let skipped = 0;
        let failed = 0;
        const failures: Array<{ revisionId: string; reason: string }> = [];

        for (let idx = 0; idx < ready.length; idx += 1) {
            const r = ready[idx];
            try {
                await prisma.$transaction(async (tx) => {
                    // race guard: もう一度突合する
                    const cur = await tx.problem.findUnique({
                        where: { id: r.problem.id },
                        select: { publishedRevisionId: true },
                    });
                    if (!cur || cur.publishedRevisionId !== r.id) throw new Error('SKIP_RACE');

                    await tx.problem.update({
                        where: { id: r.problem.id },
                        data: { publishedRevisionId: null },
                    });
                    await tx.problemRevision.update({
                        where: { id: r.id },
                        data: { status: 'DRAFT', publishedAt: null },
                    });
                });
                succeeded += 1;
            } catch (err) {
                const msg = (err as Error).message;
                if (msg === 'SKIP_RACE') {
                    skipped += 1;
                } else {
                    failed += 1;
                    failures.push({ revisionId: r.id, reason: msg });
                }
            }
            if ((idx + 1) % 50 === 0) console.log(`  ${idx + 1}/${ready.length} 件処理...`);
            await new Promise((res) => setTimeout(res, 20));
        }

        console.log('');
        console.log(`[apply] 成功:     ${succeeded}`);
        console.log(`[apply] race-skip: ${skipped}`);
        console.log(`[apply] 失敗:     ${failed}`);
        if (failures.length > 0) {
            console.log('\n[apply] 失敗詳細 (先頭 10 件):');
            for (const f of failures.slice(0, 10)) {
                console.log(`  - ${f.revisionId}: ${f.reason}`);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
