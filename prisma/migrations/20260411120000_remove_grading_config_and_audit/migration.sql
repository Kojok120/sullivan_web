ALTER TABLE "ProblemRevision"
  DROP COLUMN IF EXISTS "gradingConfig";

DROP TABLE IF EXISTS "ProblemGradingAudit";

DROP TYPE IF EXISTS "GradingMode";
DROP TYPE IF EXISTS "ProblemGraderType";
