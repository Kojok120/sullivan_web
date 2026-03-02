CREATE TABLE "VocabularyGameScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "maxCombo" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyGameScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VocabularyGameScore_userId_sessionId_key" ON "VocabularyGameScore"("userId", "sessionId");
CREATE INDEX "VocabularyGameScore_playedAt_idx" ON "VocabularyGameScore"("playedAt");
CREATE INDEX "VocabularyGameScore_userId_playedAt_idx" ON "VocabularyGameScore"("userId", "playedAt");

ALTER TABLE "VocabularyGameScore"
ADD CONSTRAINT "VocabularyGameScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
