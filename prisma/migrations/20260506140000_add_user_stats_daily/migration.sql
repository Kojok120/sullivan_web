-- UserStatsDaily: LearningHistory の日次集計を事前計算する非正規化テーブル
-- dashboard ヒートマップ等の 365 日 GROUP BY を単純な範囲読み出しに置き換える。
-- 当日分は LearningHistory から live で読み、履歴日分はこのテーブルから読む。
-- 再集計は scripts/backfill-user-stats-daily.ts または worker /internal/recompute-stats-daily 経由で実行する。

CREATE TABLE "UserStatsDaily" (
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalSolved" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStatsDaily_pkey" PRIMARY KEY ("userId", "date")
);

-- 日付降順インデックス: 直近 N 日分を取り出す範囲スキャン用
CREATE INDEX "UserStatsDaily_userId_date_idx"
    ON "UserStatsDaily" ("userId", "date" DESC);

ALTER TABLE "UserStatsDaily"
    ADD CONSTRAINT "UserStatsDaily_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
