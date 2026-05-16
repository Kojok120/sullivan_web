-- Enable RLS on all existing application tables
ALTER TABLE "Achievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Classroom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoreProblem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyLearningSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuidanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Problem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserAchievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserCoreProblemState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserProblemState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_CoreProblemToProblem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grading_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "realtime_events" ENABLE ROW LEVEL SECURITY;

-- Students can read only their own realtime events
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'auth'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'realtime_events'
        AND policyname = 'Users can read own realtime events'
    ) THEN
      CREATE POLICY "Users can read own realtime events"
        ON "realtime_events"
        FOR SELECT
        TO authenticated
        USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'prismaUserId'::text) = user_id));
    END IF;
  END IF;
END
$$;
