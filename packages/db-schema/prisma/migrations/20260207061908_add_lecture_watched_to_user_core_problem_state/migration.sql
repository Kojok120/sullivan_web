/*
  Warnings:

  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "password";

-- AlterTable
ALTER TABLE "UserCoreProblemState" ADD COLUMN     "isLectureWatched" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lectureWatchedAt" TIMESTAMP(3);
