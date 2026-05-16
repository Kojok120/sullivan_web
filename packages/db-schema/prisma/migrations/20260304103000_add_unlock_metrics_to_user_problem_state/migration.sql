-- AlterTable
ALTER TABLE "UserProblemState"
ADD COLUMN "unlockLastAnsweredAt" TIMESTAMP(3),
ADD COLUMN "unlockIsCleared" BOOLEAN NOT NULL DEFAULT false;

-- 既存データを初期同期（過去データの再計算は行わない）
UPDATE "UserProblemState"
SET
  "unlockLastAnsweredAt" = "lastAnsweredAt",
  "unlockIsCleared" = "isCleared";
