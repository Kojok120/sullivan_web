import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import {
    recomputeAllForDateRange,
    startOfUtcDate,
} from '../src/lib/user-stats-daily-service';

/**
 * `UserStatsDaily` を `LearningHistory` から再構築するバックフィルスクリプト。
 *
 * 既存行は ON CONFLICT で上書きされるため、何度実行しても安全（idempotent）。
 *
 * 使い方:
 *   npx tsx scripts/backfill-user-stats-daily.ts                # 直近 365 日
 *   npx tsx scripts/backfill-user-stats-daily.ts --days 30      # 直近 30 日
 *   npx tsx scripts/backfill-user-stats-daily.ts --from 2026-01-01 --to 2026-05-01
 *   npx tsx scripts/backfill-user-stats-daily.ts --dry-run      # 範囲だけ表示
 */

type Args = {
    fromDate: Date;
    toDate: Date;
    dryRun: boolean;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 365;

function parseDate(value: string, label: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${label} の日付形式が不正です: ${value}`);
    }
    return startOfUtcDate(date);
}

function parseArgs(argv: string[]): Args {
    const dryRun = argv.includes('--dry-run');
    let fromArg: string | undefined;
    let toArg: string | undefined;
    let daysArg: number | undefined;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--from') {
            fromArg = argv[i + 1];
            i++;
        } else if (arg === '--to') {
            toArg = argv[i + 1];
            i++;
        } else if (arg === '--days') {
            const v = Number(argv[i + 1]);
            if (!Number.isFinite(v) || v <= 0) {
                throw new Error(`--days には正の整数を指定してください: ${argv[i + 1]}`);
            }
            daysArg = Math.floor(v);
            i++;
        }
    }

    const todayUtc = startOfUtcDate(new Date());
    // to は exclusive。デフォルトは「今日 0:00 + 1日」= 明日 0:00 とし、今日分も含める。
    const defaultTo = new Date(todayUtc.getTime() + ONE_DAY_MS);

    let fromDate: Date;
    let toDate: Date;

    if (fromArg && toArg) {
        fromDate = parseDate(fromArg, '--from');
        toDate = parseDate(toArg, '--to');
    } else if (fromArg) {
        fromDate = parseDate(fromArg, '--from');
        toDate = defaultTo;
    } else if (toArg) {
        toDate = parseDate(toArg, '--to');
        const days = daysArg ?? DEFAULT_DAYS;
        fromDate = new Date(toDate.getTime() - days * ONE_DAY_MS);
    } else {
        const days = daysArg ?? DEFAULT_DAYS;
        toDate = defaultTo;
        fromDate = new Date(toDate.getTime() - days * ONE_DAY_MS);
    }

    if (fromDate.getTime() >= toDate.getTime()) {
        throw new Error(`from(${fromDate.toISOString()}) は to(${toDate.toISOString()}) より前である必要があります`);
    }

    return { fromDate, toDate, dryRun };
}

async function main() {
    const { fromDate, toDate, dryRun } = parseArgs(process.argv.slice(2));

    const fromIso = fromDate.toISOString().slice(0, 10);
    const toIso = toDate.toISOString().slice(0, 10);
    console.log('--- UserStatsDaily バックフィル ---');
    console.log(`期間: [${fromIso}, ${toIso})  (UTC, to は exclusive)`);
    console.log(`モード: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);

    if (dryRun) {
        const result = await prisma.$queryRaw<Array<{ users: bigint; rows: bigint }>>`
            SELECT
                COUNT(DISTINCT "userId")::bigint AS users,
                COUNT(*)::bigint AS rows
            FROM "LearningHistory"
            WHERE "answeredAt" >= ${fromDate}
                AND "answeredAt" < ${toDate}
        `;
        const summary = result[0];
        console.log(`期間内に学習履歴のあるユーザ数: ${summary?.users?.toString() ?? '0'}`);
        console.log(`期間内の学習履歴総数: ${summary?.rows?.toString() ?? '0'}`);
        console.log('（DRY-RUN のため再集計は実行しません）');
        return;
    }

    const startedAt = Date.now();
    const { users, rows } = await recomputeAllForDateRange(fromDate, toDate);
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('--- 完了 ---');
    console.log(`再集計ユーザ数: ${users}`);
    console.log(`upsert 行数: ${rows}`);
    console.log(`所要時間: ${elapsedSec}s`);
}

main()
    .catch((error) => {
        console.error('バックフィルに失敗しました:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
