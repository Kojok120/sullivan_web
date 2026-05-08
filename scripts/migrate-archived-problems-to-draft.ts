/**
 * Problem.status === 'ARCHIVED' のレコードを 'DRAFT' に移行するワンショットスクリプト。
 *
 * 背景: ProblemStatus enum から ARCHIVED を廃止する事前データ移行。
 *       Prisma migrate で enum 値を削除する前に、すべての ARCHIVED 行を別の有効値へ
 *       退避させておかないとマイグレーションが失敗する。
 *
 * - 冪等（再実行しても結果が同じ）
 * - DEV → PROD の順で実行する
 *
 * 使い方:
 *   tsx scripts/migrate-archived-problems-to-draft.ts             # 確認プロンプトあり
 *   tsx scripts/migrate-archived-problems-to-draft.ts --dry-run   # 集計のみ
 *   tsx scripts/migrate-archived-problems-to-draft.ts --yes       # 確認スキップ
 *
 * 接続先 DB は dotenv で .env.DEV から読み込む。
 * PROD 実行時は DATABASE_URL を明示的に指定して上書きすること。
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEV_ENV_FILE = resolve(__dirname, '..', '.env.DEV');
// 既に DATABASE_URL が指定されていればそちらを優先（PROD 実行時は明示的に上書きする運用）。
// 未指定の場合のみ .env.DEV をロードする。
if (!process.env.DATABASE_URL && existsSync(DEV_ENV_FILE)) {
    loadDotenv({ path: DEV_ENV_FILE });
}

interface CliOptions {
    dryRun: boolean;
    yes: boolean;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { dryRun: false, yes: false };
    for (const arg of argv) {
        switch (arg) {
            case '--dry-run':
                opts.dryRun = true;
                break;
            case '--yes':
            case '-y':
                opts.yes = true;
                break;
            default:
                if (arg.startsWith('--')) {
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

async function confirmInteractive(question: string): Promise<boolean> {
    const rl = createInterface({ input, output });
    try {
        const answer = (await rl.question(`${question} [y/N]: `)).trim().toLowerCase();
        return answer === 'y' || answer === 'yes';
    } finally {
        rl.close();
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    console.log('--- ARCHIVED 問題を DRAFT へ移行 ---');
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const { prisma } = await import('../src/lib/prisma');
    try {
        // ProblemStatus enum から ARCHIVED が削除された後はこのスクリプトは no-op になるが、
        // 過去の DB 状態（enum に ARCHIVED が残っているケース）でも動かせるよう raw SQL で参照する。
        const targets = await prisma.$queryRaw<Array<{ id: string; customId: string; subjectId: string }>>`
            SELECT "id", "customId", "subjectId"
            FROM "Problem"
            WHERE "status"::text = 'ARCHIVED'
            ORDER BY "customId" ASC
        `;

        console.log(`\nARCHIVED 件数: ${targets.length} 件`);

        const sampleSize = 10;
        if (targets.length > 0) {
            console.log(`--- 対象サンプル（先頭 ${Math.min(sampleSize, targets.length)} 件） ---`);
            for (const problem of targets.slice(0, sampleSize)) {
                console.log(`  ${problem.customId} (id=${problem.id}, subjectId=${problem.subjectId})`);
            }
        }

        if (opts.dryRun) {
            console.log('\n--dry-run のため終了します');
            return;
        }
        if (targets.length === 0) {
            console.log('対象なし。終了します');
            return;
        }

        if (!opts.yes) {
            const ok = await confirmInteractive('上記 ARCHIVED 問題を DRAFT に変更します。続行しますか？');
            if (!ok) {
                console.log('キャンセルしました');
                return;
            }
        }

        const updated = await prisma.$executeRaw`
            UPDATE "Problem"
            SET "status" = 'DRAFT'::"ProblemStatus"
            WHERE "status"::text = 'ARCHIVED'
        `;

        console.log(`\n完了: ${updated} 件のステータスを ARCHIVED -> DRAFT に変更しました`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
