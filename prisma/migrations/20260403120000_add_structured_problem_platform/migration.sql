CREATE TYPE "ProblemType" AS ENUM (
  'SHORT_TEXT',
  'NUMERIC',
  'MULTIPLE_CHOICE',
  'MULTI_BLANK',
  'FORMULA_FINAL',
  'TABLE_FILL',
  'GRAPH_READ',
  'GRAPH_DRAW',
  'GEOMETRY',
  'DIAGRAM_LABEL',
  'SHORT_EXPLANATION',
  'SCIENCE_EXPERIMENT'
);

CREATE TYPE "ProblemContentFormat" AS ENUM (
  'PLAIN_TEXT',
  'STRUCTURED_V1'
);

CREATE TYPE "ProblemStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
);

CREATE TYPE "ProblemRevisionStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED'
);

CREATE TYPE "ProblemAuthoringTool" AS ENUM (
  'MANUAL',
  'DESMOS',
  'GEOGEBRA',
  'SVG',
  'UPLOAD'
);

CREATE TYPE "PrintTemplate" AS ENUM (
  'COMPACT',
  'STANDARD',
  'WORKSPACE',
  'GRAPH',
  'TABLE',
  'EXPLANATION'
);

CREATE TYPE "GradingMode" AS ENUM (
  'EXACT',
  'NUMERIC_TOLERANCE',
  'CHOICE',
  'MULTI_BLANK',
  'FORMULA',
  'AI_RUBRIC',
  'AI_VISION_RUBRIC'
);

CREATE TYPE "ProblemAssetKind" AS ENUM (
  'IMAGE',
  'SVG',
  'PDF',
  'DESMOS_STATE',
  'GEOGEBRA_STATE',
  'JSON',
  'THUMBNAIL'
);

CREATE TYPE "ProblemGraderType" AS ENUM (
  'DETERMINISTIC',
  'AI',
  'AI_VISION',
  'MANUAL_OVERRIDE'
);

ALTER TABLE "Problem"
  ADD COLUMN "problemType" "ProblemType" NOT NULL DEFAULT 'SHORT_TEXT',
  ADD COLUMN "contentFormat" "ProblemContentFormat" NOT NULL DEFAULT 'PLAIN_TEXT',
  ADD COLUMN "status" "ProblemStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "hasStructuredContent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedRevisionId" TEXT;

ALTER TABLE "LearningHistory"
  ADD COLUMN "problemRevisionId" TEXT;

CREATE TABLE "ProblemRevision" (
  "id" TEXT NOT NULL,
  "problemId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "status" "ProblemRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "structuredContent" JSONB,
  "answerSpec" JSONB,
  "printConfig" JSONB,
  "gradingConfig" JSONB,
  "authoringTool" "ProblemAuthoringTool" NOT NULL DEFAULT 'MANUAL',
  "authoringState" JSONB,
  "createdByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProblemRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemAsset" (
  "id" TEXT NOT NULL,
  "problemRevisionId" TEXT NOT NULL,
  "kind" "ProblemAssetKind" NOT NULL,
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "checksum" TEXT,
  "sourceTool" "ProblemAuthoringTool" NOT NULL DEFAULT 'UPLOAD',
  "metadata" JSONB,
  "inlineContent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProblemAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemGradingAudit" (
  "id" TEXT NOT NULL,
  "problemId" TEXT NOT NULL,
  "problemRevisionId" TEXT,
  "learningHistoryId" TEXT,
  "gradingMode" "GradingMode" NOT NULL,
  "graderType" "ProblemGraderType" NOT NULL,
  "source" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "confidence" DOUBLE PRECISION,
  "reason" TEXT,
  "modelVersion" TEXT,
  "promptVersion" TEXT,
  "rawResponseDigest" TEXT,
  "payload" JSONB,
  "overrideScore" DOUBLE PRECISION,
  "overrideReason" TEXT,
  "overrideByUserId" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProblemGradingAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Problem_publishedRevisionId_key" ON "Problem"("publishedRevisionId");
CREATE UNIQUE INDEX "ProblemRevision_problemId_revisionNumber_key" ON "ProblemRevision"("problemId", "revisionNumber");
CREATE INDEX "ProblemRevision_problemId_status_revisionNumber_idx" ON "ProblemRevision"("problemId", "status", "revisionNumber");
CREATE INDEX "ProblemAsset_problemRevisionId_kind_idx" ON "ProblemAsset"("problemRevisionId", "kind");
CREATE INDEX "ProblemGradingAudit_problemId_createdAt_idx" ON "ProblemGradingAudit"("problemId", "createdAt" DESC);
CREATE INDEX "ProblemGradingAudit_learningHistoryId_idx" ON "ProblemGradingAudit"("learningHistoryId");

ALTER TABLE "ProblemRevision"
  ADD CONSTRAINT "ProblemRevision_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemAsset"
  ADD CONSTRAINT "ProblemAsset_problemRevisionId_fkey"
  FOREIGN KEY ("problemRevisionId") REFERENCES "ProblemRevision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningHistory"
  ADD CONSTRAINT "LearningHistory_problemRevisionId_fkey"
  FOREIGN KEY ("problemRevisionId") REFERENCES "ProblemRevision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProblemGradingAudit"
  ADD CONSTRAINT "ProblemGradingAudit_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemGradingAudit"
  ADD CONSTRAINT "ProblemGradingAudit_problemRevisionId_fkey"
  FOREIGN KEY ("problemRevisionId") REFERENCES "ProblemRevision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Problem"
  ADD CONSTRAINT "Problem_publishedRevisionId_fkey"
  FOREIGN KEY ("publishedRevisionId") REFERENCES "ProblemRevision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
