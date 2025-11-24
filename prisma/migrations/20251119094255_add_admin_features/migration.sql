-- AlterTable
ALTER TABLE "CoreProblem" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sharedVideoUrl" TEXT;

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "acceptedAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aiGradingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "difficulty" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "priorityInitial" INTEGER NOT NULL DEFAULT 50,
    "priorityAdjustmentA" INTEGER NOT NULL DEFAULT -30,
    "priorityAdjustmentB" INTEGER NOT NULL DEFAULT -10,
    "priorityAdjustmentC" INTEGER NOT NULL DEFAULT 10,
    "priorityAdjustmentD" INTEGER NOT NULL DEFAULT 30,
    "forgettingCurveRate" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "aiGradingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
