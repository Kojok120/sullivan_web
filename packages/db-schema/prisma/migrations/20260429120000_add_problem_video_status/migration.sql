-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('NONE', 'SHOT', 'UPLOADED', 'CONFIGURED');

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN "videoStatus" "VideoStatus" NOT NULL DEFAULT 'NONE';

-- Backfill: videoUrl が設定されている問題は CONFIGURED にする
UPDATE "Problem"
SET "videoStatus" = 'CONFIGURED'
WHERE "videoUrl" IS NOT NULL AND "videoUrl" <> '';
