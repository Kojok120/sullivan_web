-- AlterTable
ALTER TABLE "CoreProblem" ADD COLUMN "masterNumber" INTEGER;
ALTER TABLE "Problem" ADD COLUMN "subjectId" TEXT;

-- Guard: cross-subject problems are not supported for subject-scoped unique constraints
DO $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO conflict_count
    FROM (
        SELECT rel."B"
        FROM "_CoreProblemToProblem" rel
        JOIN "CoreProblem" cp ON cp.id = rel."A"
        GROUP BY rel."B"
        HAVING COUNT(DISTINCT cp."subjectId") > 1
    ) conflicts;

    IF conflict_count > 0 THEN
        RAISE EXCEPTION 'Found % cross-subject problems. Resolve them before migration.', conflict_count;
    END IF;
END $$;

-- Backfill CoreProblem master numbers per subject (order asc, id asc)
WITH ranked AS (
    SELECT
        cp.id,
        ROW_NUMBER() OVER (
            PARTITION BY cp."subjectId"
            ORDER BY cp."order" ASC, cp.id ASC
        ) AS rn
    FROM "CoreProblem" cp
)
UPDATE "CoreProblem" cp
SET "masterNumber" = ranked.rn
FROM ranked
WHERE cp.id = ranked.id;

-- Remove orphan problems (no core problem relation)
DELETE FROM "Problem" p
WHERE NOT EXISTS (
    SELECT 1
    FROM "_CoreProblemToProblem" rel
    WHERE rel."B" = p.id
);

-- Backfill Problem.subjectId from linked CoreProblem
WITH resolved AS (
    SELECT
        rel."B" AS "problemId",
        MIN(cp."subjectId") AS "subjectId"
    FROM "_CoreProblemToProblem" rel
    JOIN "CoreProblem" cp ON cp.id = rel."A"
    GROUP BY rel."B"
)
UPDATE "Problem" p
SET "subjectId" = resolved."subjectId"
FROM resolved
WHERE p.id = resolved."problemId";

-- Validate no remaining null subjectId
DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM "Problem"
    WHERE "subjectId" IS NULL;

    IF null_count > 0 THEN
        RAISE EXCEPTION 'Found % problems without subjectId after backfill.', null_count;
    END IF;
END $$;

-- Enforce constraints
ALTER TABLE "CoreProblem" ALTER COLUMN "masterNumber" SET NOT NULL;
ALTER TABLE "Problem" ALTER COLUMN "subjectId" SET NOT NULL;

-- Replace global unique constraints with subject-scoped unique constraints
DROP INDEX IF EXISTS "Problem_customId_key";
DROP INDEX IF EXISTS "Problem_masterNumber_key";

CREATE UNIQUE INDEX "CoreProblem_subjectId_masterNumber_key" ON "CoreProblem"("subjectId", "masterNumber");
CREATE UNIQUE INDEX "Problem_subjectId_customId_key" ON "Problem"("subjectId", "customId");
CREATE UNIQUE INDEX "Problem_subjectId_masterNumber_key" ON "Problem"("subjectId", "masterNumber");

-- Add relation after backfill
ALTER TABLE "Problem"
ADD CONSTRAINT "Problem_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
