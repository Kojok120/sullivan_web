-- 目標管理機能向けの目標テーブル
CREATE TYPE "StudentGoalType" AS ENUM ('PROBLEM_COUNT', 'CUSTOM');

CREATE TABLE "StudentGoal" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "StudentGoalType" NOT NULL,
    "name" TEXT NOT NULL,
    "subjectId" TEXT,
    "dueDateKey" TEXT NOT NULL,
    "createdByTeacherId" TEXT NOT NULL,
    "updatedByTeacherId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentGoalMilestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "targetCount" INTEGER,
    "targetText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentGoalMilestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentGoal_studentId_dueDateKey_deletedAt_idx" ON "StudentGoal"("studentId", "dueDateKey", "deletedAt");
CREATE INDEX "StudentGoalMilestone_goalId_dateKey_idx" ON "StudentGoalMilestone"("goalId", "dateKey");

CREATE UNIQUE INDEX "StudentGoalMilestone_goalId_dateKey_key" ON "StudentGoalMilestone"("goalId", "dateKey");

ALTER TABLE "StudentGoal"
ADD CONSTRAINT "StudentGoal_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentGoal"
ADD CONSTRAINT "StudentGoal_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentGoal"
ADD CONSTRAINT "StudentGoal_createdByTeacherId_fkey"
FOREIGN KEY ("createdByTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentGoal"
ADD CONSTRAINT "StudentGoal_updatedByTeacherId_fkey"
FOREIGN KEY ("updatedByTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentGoalMilestone"
ADD CONSTRAINT "StudentGoalMilestone_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "StudentGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
