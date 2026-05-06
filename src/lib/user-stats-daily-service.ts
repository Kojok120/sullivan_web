import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * 日次の学習集計を保持する `UserStatsDaily` テーブルの読み書きユーティリティ。
 *
 * 設計方針:
 * - `LearningHistory` の (userId, date(answeredAt)) GROUP BY を事前計算する非正規化テーブル。
 * - 当日分は live で計算し、履歴日分はこのテーブルから読む。
 * - 再集計は idempotent な INSERT ... ON CONFLICT DO UPDATE で実行する（バックフィル / 夜間バッチで使い回せる）。
 * - 集計範囲外の日（=学習がない日）は、ON CONFLICT 元の SELECT が 0 件になるためテーブル行は作らない。
 *   読み出し側は「行が無い日 = 0 件」として扱う。
 */

export type UserStatsDailyRow = {
    userId: string;
    date: Date; // UTC 0:00 の Date
    totalSolved: number;
    correctCount: number;
    xpEarned: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * UTC 基準で日付を切り捨てる（0:00:00.000）。
 */
export function startOfUtcDate(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/**
 * `from` から `to`（exclusive）の UTC 日付配列を生成する。
 * 例: from=2026-05-01, to=2026-05-04 → [2026-05-01, 2026-05-02, 2026-05-03]
 */
export function listUtcDates(from: Date, to: Date): Date[] {
    const start = startOfUtcDate(from).getTime();
    const end = startOfUtcDate(to).getTime();
    if (start >= end) return [];
    const dates: Date[] = [];
    for (let t = start; t < end; t += ONE_DAY_MS) {
        dates.push(new Date(t));
    }
    return dates;
}

/**
 * 単一ユーザの指定範囲を再集計する。
 * `from` ≤ date < `to` の範囲を対象とし、既存行は上書き、学習が無い日は何もしない（孤児にしない）。
 * 既存行で from..to の範囲に含まれるが LearningHistory が空になっている日（履歴削除など）は、
 * このメソッドでは検知できない。整合性が必要なら recomputeForUserDateRange の前に範囲削除を呼ぶ。
 *
 * 戻り値は upsert された行数。
 */
export async function recomputeForUserDateRange(
    userId: string,
    from: Date,
    to: Date,
): Promise<number> {
    const start = startOfUtcDate(from);
    const end = startOfUtcDate(to);
    if (start.getTime() >= end.getTime()) return 0;

    // INSERT ... SELECT ... GROUP BY で1往復で確定する。
    // evaluation A/B を correct とみなす（既存実装と同一の判定基準）。
    const result = await prisma.$executeRaw`
        INSERT INTO "UserStatsDaily" ("userId", "date", "totalSolved", "correctCount", "xpEarned", "updatedAt")
        SELECT
            ${userId} AS "userId",
            DATE_TRUNC('day', lh."answeredAt" AT TIME ZONE 'UTC')::date AS "date",
            COUNT(*)::int AS "totalSolved",
            SUM(CASE WHEN lh."evaluation" IN ('A', 'B') THEN 1 ELSE 0 END)::int AS "correctCount",
            0 AS "xpEarned",
            NOW() AS "updatedAt"
        FROM "LearningHistory" lh
        WHERE lh."userId" = ${userId}
            AND lh."answeredAt" >= ${start}
            AND lh."answeredAt" < ${end}
        GROUP BY DATE_TRUNC('day', lh."answeredAt" AT TIME ZONE 'UTC')::date
        ON CONFLICT ("userId", "date")
        DO UPDATE SET
            "totalSolved" = EXCLUDED."totalSolved",
            "correctCount" = EXCLUDED."correctCount",
            "updatedAt" = NOW()
    `;
    return Number(result);
}

/**
 * 指定範囲（[from, to)）について、当該期間に学習履歴のあった全ユーザを再集計する。
 * 夜間バッチで「昨日分を全員分やり直す」運用を想定。
 *
 * バッチサイズ単位でユーザを処理し、ロングトランザクションを避ける。
 */
export async function recomputeAllForDateRange(
    from: Date,
    to: Date,
    options: { batchSize?: number } = {},
): Promise<{ users: number; rows: number }> {
    const start = startOfUtcDate(from);
    const end = startOfUtcDate(to);
    if (start.getTime() >= end.getTime()) return { users: 0, rows: 0 };
    const batchSize = options.batchSize ?? 50;

    // 期間内に学習履歴があったユーザ ID を抽出
    const userRows = await prisma.$queryRaw<Array<{ userId: string }>>`
        SELECT DISTINCT "userId"
        FROM "LearningHistory"
        WHERE "answeredAt" >= ${start} AND "answeredAt" < ${end}
    `;

    let totalRows = 0;
    for (let i = 0; i < userRows.length; i += batchSize) {
        const chunk = userRows.slice(i, i + batchSize);
        const results = await Promise.all(
            chunk.map((row) => recomputeForUserDateRange(row.userId, start, end)),
        );
        totalRows += results.reduce((sum, n) => sum + n, 0);
    }
    return { users: userRows.length, rows: totalRows };
}

/**
 * 指定ユーザの [from, to) の日次集計を取得する。
 * 行が無い日は除外される（呼び出し側で「日付ごとのマップ」を作る前提）。
 */
export async function readForUserDateRange(
    userId: string,
    from: Date,
    to: Date,
): Promise<UserStatsDailyRow[]> {
    const start = startOfUtcDate(from);
    const end = startOfUtcDate(to);
    if (start.getTime() >= end.getTime()) return [];

    const rows = await prisma.userStatsDaily.findMany({
        where: {
            userId,
            date: { gte: start, lt: end },
        },
        orderBy: { date: 'asc' },
        select: {
            userId: true,
            date: true,
            totalSolved: true,
            correctCount: true,
            xpEarned: true,
        },
    });
    return rows.map((row) => ({
        userId: row.userId,
        date: row.date,
        totalSolved: row.totalSolved,
        correctCount: row.correctCount,
        xpEarned: row.xpEarned,
    }));
}

/**
 * 単発の sanity-check 用ユーティリティ。Prisma Json などを介さない型のまま再 export する。
 * ヘルパとして外部に export しておくとテストやスクリプトから使いやすい。
 */
export const userStatsDailySql = {
    /** 指定ユーザ・指定日の totalSolved を返す raw クエリ（テスト用ヘルパ）。 */
    countAt: (userId: string, date: Date): Prisma.Sql => Prisma.sql`
        SELECT "totalSolved" FROM "UserStatsDaily"
        WHERE "userId" = ${userId} AND "date" = ${startOfUtcDate(date)}
    `,
};
