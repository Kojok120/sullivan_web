/*
  Warnings:

  - You are about to drop the column `description` on the `CoreProblem` table. All the data in the column will be lost.
  - You are about to drop the column `sharedVideoUrl` on the `CoreProblem` table. All the data in the column will be lost.
  - You are about to drop the column `unitId` on the `CoreProblem` table. All the data in the column will be lost.
  - You are about to drop the column `aiGradingEnabled` on the `Problem` table. All the data in the column will be lost.
  - You are about to drop the column `coreProblemId` on the `Problem` table. All the data in the column will be lost.
  - You are about to drop the column `difficulty` on the `Problem` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Problem` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Problem` table. All the data in the column will be lost.
  - You are about to drop the column `classroom` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SystemSettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Unit` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[customId]` on the table `Problem` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `subjectId` to the `CoreProblem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CoreProblem" DROP CONSTRAINT "CoreProblem_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Problem" DROP CONSTRAINT "Problem_coreProblemId_fkey";

-- DropForeignKey
ALTER TABLE "Unit" DROP CONSTRAINT "Unit_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_groupId_fkey";

-- AlterTable
ALTER TABLE "CoreProblem" DROP COLUMN "description",
DROP COLUMN "sharedVideoUrl",
DROP COLUMN "unitId",
ADD COLUMN     "subjectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Problem" DROP COLUMN "aiGradingEnabled",
DROP COLUMN "coreProblemId",
DROP COLUMN "difficulty",
DROP COLUMN "tags",
DROP COLUMN "type",
ADD COLUMN     "customId" TEXT,
ADD COLUMN     "grade" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "classroom",
DROP COLUMN "groupId",
ADD COLUMN     "classroomId" TEXT,
ADD COLUMN     "group" TEXT;

-- DropTable
DROP TABLE "Group";

-- DropTable
DROP TABLE "SystemSettings";

-- DropTable
DROP TABLE "Unit";

-- DropEnum
DROP TYPE "ProblemType";

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCoreProblemState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coreProblemId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isUnlocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserCoreProblemState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CoreProblemToProblem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CoreProblemToProblem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_name_key" ON "Classroom"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserCoreProblemState_userId_coreProblemId_key" ON "UserCoreProblemState"("userId", "coreProblemId");

-- CreateIndex
CREATE INDEX "_CoreProblemToProblem_B_index" ON "_CoreProblemToProblem"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_customId_key" ON "Problem"("customId");

-- AddForeignKey
ALTER TABLE "CoreProblem" ADD CONSTRAINT "CoreProblem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoreProblemState" ADD CONSTRAINT "UserCoreProblemState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoreProblemState" ADD CONSTRAINT "UserCoreProblemState_coreProblemId_fkey" FOREIGN KEY ("coreProblemId") REFERENCES "CoreProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CoreProblemToProblem" ADD CONSTRAINT "_CoreProblemToProblem_A_fkey" FOREIGN KEY ("A") REFERENCES "CoreProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CoreProblemToProblem" ADD CONSTRAINT "_CoreProblemToProblem_B_fkey" FOREIGN KEY ("B") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
