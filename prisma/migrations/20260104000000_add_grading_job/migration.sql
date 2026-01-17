-- Create grading job status enum
CREATE TYPE "GradingJobStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- Create grading jobs table for idempotency
CREATE TABLE "grading_jobs" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "GradingJobStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grading_jobs_file_id_key" ON "grading_jobs"("file_id");
CREATE INDEX "grading_jobs_status_updated_at_idx" ON "grading_jobs"("status", "updated_at");
