CREATE INDEX "LearningHistory_userId_answeredAt_idx"
ON "LearningHistory"("userId", "answeredAt" DESC);

CREATE INDEX "LearningHistory_groupId_userId_id_idx"
ON "LearningHistory"("groupId", "userId", "id");

CREATE INDEX "LearningHistory_userId_groupId_isStudentReviewed_idx"
ON "LearningHistory"("userId", "groupId", "isStudentReviewed");

CREATE INDEX "LearningHistory_userId_groupId_answeredAt_idx"
ON "LearningHistory"("userId", "groupId", "answeredAt" DESC);
