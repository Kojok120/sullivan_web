-- Manually adding missing columns to LearningHistory
ALTER TABLE "LearningHistory" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
ALTER TABLE "LearningHistory" ADD COLUMN IF NOT EXISTS "isVideoWatched" BOOLEAN NOT NULL DEFAULT false;
