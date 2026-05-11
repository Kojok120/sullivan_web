/**
 * 英語問題の question 末尾に付いている「【〇〇県/府/都/道(・改)?】」と
 * その直前の改行をまとめて削除する一回限りスクリプト。
 *
 * 前提:
 *   PROD/DEV で publishedRevision を持つ該当問題は 0 件のため、Problem.question
 *   のみ update する。publishedRevision を持つ問題が出てきた場合は安全側に倒し
 *   skip して人間判断対象として一覧出力する。
 *
 * 削除パターン:
 *   /\n+\s*【[^】\/]+(?:県|府|都)(?:・改)?】\s*$/   (・改 サフィックス含む)
 *   /\n+\s*【北海道(?:・改)?】\s*$/
 *
 * 安全装置:
 *   - --dry-run がデフォルト、--yes 明示時のみ書き込み
 *   - 1 件ずつ独立 update、現在値を再取得して期待文字列で終わるか確認
 *
 * 使い方:
 *   npx tsx scripts/strip-prefecture-tags.ts --env production --dry-run
 *   npx tsx scripts/strip-prefecture-tags.ts --env production --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

interface CliOptions {
    env: EnvName;
    dryRun: boolean;
    yes: boolean;
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', dryRun: true, yes: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--env') {
            const v = argv[i + 1];
            if (v !== 'dev' && v !== 'production') {
                throw new Error('--env には dev か production');
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
            opts.yes = true;
            opts.dryRun = false;
            continue;
        }
        if (arg?.startsWith('--')) {
            throw new Error(`未知のオプション: ${arg}`);
        }
    }
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

// 末尾の都道府県タグ + 直前改行をまとめて削除する正規表現
// 選択肢用の【 a / b / c 】を巻き込まないよう、タグ内容を漢字＋県/府/都 か
// 「北海道」に限定（・改 サフィックスのみ許容）。
const STRIP_RE = /(?:\n+\s*)?【(?:[^】\/]+(?:県|府|都)(?:・改)?|北海道(?:・改)?)】\s*$/;

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) throw new Error(`env file not found: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    console.log('--- 都道府県タグ削除 ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`mode: ${opts.dryRun ? 'dry-run' : 'apply'}`);

    const prisma = await loadPrisma();
    try {
        const all = await prisma.problem.findMany({
            where: { subject: { name: '英語' }, status: 'PUBLISHED' },
            select: {
                id: true,
                customId: true,
                question: true,
                publishedRevisionId: true,
            },
            orderBy: { customIdSortKey: 'asc' },
        });

        const targets: Array<{ id: string; customId: string; before: string; after: string }> = [];
        const withRevSkipped: Array<{ id: string; customId: string }> = [];

        for (const p of all) {
            if (!STRIP_RE.test(p.question)) continue;
            if (p.publishedRevisionId !== null) {
                withRevSkipped.push({ id: p.id, customId: p.customId });
                continue;
            }
            const after = p.question.replace(STRIP_RE, '');
            if (after === p.question) continue;
            targets.push({ id: p.id, customId: p.customId, before: p.question, after });
        }

        console.log(`\n[scan] 対象: ${targets.length}`);
        console.log(`[scan] publishedRevision あり (skip): ${withRevSkipped.length}`);

        if (targets.length > 0) {
            console.log('\n[sample] 先頭 3 件 before → after:');
            for (const t of targets.slice(0, 3)) {
                console.log(`\n  ${t.customId}:`);
                console.log(`    before: ${JSON.stringify(t.before.slice(-80))}`);
                console.log(`    after : ${JSON.stringify(t.after.slice(-80))}`);
            }
        }
        if (withRevSkipped.length > 0) {
            console.log('\n[skip] publishedRevision あり customId 一覧:');
            for (const s of withRevSkipped) console.log(`  - ${s.customId}`);
        }

        if (opts.dryRun) {
            console.log('\n--dry-run のため DB 書き込みは行いません');
            return;
        }

        if (targets.length === 0) {
            console.log('\n対象 0 件、何もしません');
            return;
        }

        let succeeded = 0;
        let raceSkipped = 0;
        const failures: Array<{ customId: string; reason: string }> = [];

        for (const t of targets) {
            try {
                const current = await prisma.problem.findUnique({
                    where: { id: t.id },
                    select: { question: true, publishedRevisionId: true },
                });
                if (!current) {
                    failures.push({ customId: t.customId, reason: 'not found' });
                    continue;
                }
                if (current.publishedRevisionId !== null) {
                    raceSkipped += 1;
                    continue;
                }
                if (current.question !== t.before) {
                    raceSkipped += 1;
                    continue;
                }
                await prisma.problem.update({
                    where: { id: t.id },
                    data: { question: t.after },
                });
                succeeded += 1;
            } catch (err) {
                failures.push({ customId: t.customId, reason: (err as Error).message });
            }
            await new Promise((r) => setTimeout(r, 20));
        }

        console.log(`\n[apply] 成功:    ${succeeded}`);
        console.log(`[apply] race-skip: ${raceSkipped}`);
        console.log(`[apply] 失敗:    ${failures.length}`);
        if (failures.length > 0) {
            for (const f of failures.slice(0, 10)) console.log(`  - ${f.customId}: ${f.reason}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('failed:', err);
    process.exitCode = 1;
});
