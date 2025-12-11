-- Drop and recreate Foreign Keys with CASCADE DELETE

-- LearningHistory
ALTER TABLE "LearningHistory" DROP CONSTRAINT "LearningHistory_problemId_fkey";
ALTER TABLE "LearningHistory" ADD CONSTRAINT "LearningHistory_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserProblemState
ALTER TABLE "UserProblemState" DROP CONSTRAINT "UserProblemState_problemId_fkey";
ALTER TABLE "UserProblemState" ADD CONSTRAINT "UserProblemState_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
