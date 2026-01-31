/*
  Warnings:

  - A unique constraint covering the columns `[masterNumber]` on the table `Problem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "masterNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Problem_masterNumber_key" ON "Problem"("masterNumber");
