/*
  Warnings:

  - You are about to drop the column `lectureVideoUrl` on the `CoreProblem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CoreProblem" DROP COLUMN "lectureVideoUrl",
ADD COLUMN     "lectureVideos" JSONB;
