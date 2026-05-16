-- AlterTable
ALTER TABLE "Problem" ALTER COLUMN "answer" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserAchievement" ADD COLUMN     "isSeen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "grading_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;
