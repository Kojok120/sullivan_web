-- AlterTable
ALTER TABLE "ProblemAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProblemGradingAudit" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProblemRevision" ALTER COLUMN "updatedAt" DROP DEFAULT;
