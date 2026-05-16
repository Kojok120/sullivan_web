DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyCategory') THEN
    CREATE TYPE "SurveyCategory" AS ENUM (
      'GRIT',
      'SELF_EFFICACY',
      'SELF_REGULATION',
      'GROWTH_MINDSET',
      'EMOTIONAL_REGULATION'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "QuestionBank" (
    "id" TEXT NOT NULL,
    "category" "SurveyCategory" NOT NULL,
    "question" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL,
    "scores" JSONB NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SurveyResponse_userId_fkey'
  ) THEN
    ALTER TABLE "SurveyResponse"
      ADD CONSTRAINT "SurveyResponse_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "SurveyResponse_userId_answeredAt_idx"
    ON "SurveyResponse"("userId", "answeredAt" DESC);
