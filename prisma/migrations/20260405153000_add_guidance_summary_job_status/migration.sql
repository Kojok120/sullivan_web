CREATE TYPE "GuidanceRecordStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "GuidanceRecord"
ADD COLUMN "status" "GuidanceRecordStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "summaryErrorCode" TEXT,
ADD COLUMN "summaryErrorMessage" TEXT,
ADD COLUMN "summaryJobAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "geminiFileName" TEXT;

CREATE INDEX "GuidanceRecord_status_updatedAt_idx" ON "GuidanceRecord"("status", "updatedAt");
