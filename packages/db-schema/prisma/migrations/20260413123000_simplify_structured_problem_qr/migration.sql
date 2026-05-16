CREATE OR REPLACE FUNCTION "normalize_exact_answer_spec"(input JSONB)
RETURNS JSONB
LANGUAGE SQL
AS $$
WITH source AS (
    SELECT CASE
        WHEN input IS NULL OR jsonb_typeof(input) <> 'object' THEN '{}'::jsonb
        ELSE input
    END AS data
),
normalized AS (
    SELECT
        CASE
            WHEN data ? 'correctAnswer' THEN BTRIM(COALESCE(data->>'correctAnswer', ''))
            WHEN data->>'kind' IN ('exact', 'numeric', 'formula') THEN BTRIM(COALESCE(data->>'correctAnswer', ''))
            WHEN data->>'kind' = 'choice' THEN BTRIM(COALESCE(data->>'correctChoiceId', ''))
            WHEN data->>'kind' IN ('rubric', 'visionRubric') THEN BTRIM(COALESCE(data->>'modelAnswer', data->>'rubric', ''))
            WHEN data->>'kind' = 'multiBlank' THEN COALESCE((
                SELECT string_agg(line, E'\n')
                FROM (
                    SELECT CASE
                        WHEN blank_id IS NOT NULL AND blank_answer IS NOT NULL THEN blank_id || ': ' || blank_answer
                        WHEN blank_answer IS NOT NULL THEN blank_answer
                        ELSE blank_id
                    END AS line
                    FROM (
                        SELECT
                            NULLIF(BTRIM(COALESCE(blank->>'id', '')), '') AS blank_id,
                            NULLIF(BTRIM(COALESCE(blank->>'correctAnswer', '')), '') AS blank_answer
                        FROM jsonb_array_elements(
                            CASE
                                WHEN jsonb_typeof(data->'blanks') = 'array' THEN data->'blanks'
                                ELSE '[]'::jsonb
                            END
                        ) AS blank
                    ) blank_lines
                ) lines
                WHERE line IS NOT NULL
            ), '')
            ELSE ''
        END AS correct_answer,
        CASE
            WHEN data ? 'acceptedAnswers' THEN COALESCE((
                SELECT jsonb_agg(value_text)
                FROM (
                    SELECT NULLIF(BTRIM(value), '') AS value_text
                    FROM jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(data->'acceptedAnswers') = 'array' THEN data->'acceptedAnswers'
                            ELSE '[]'::jsonb
                        END
                    ) AS accepted(value)
                ) accepted_values
                WHERE value_text IS NOT NULL
            ), '[]'::jsonb)
            WHEN data->>'kind' = 'multiBlank' THEN COALESCE((
                SELECT jsonb_agg(candidate_text)
                FROM (
                    SELECT NULLIF(BTRIM(
                        CASE
                            WHEN blank_id IS NOT NULL THEN blank_id || ': ' || candidate_value
                            ELSE candidate_value
                        END
                    ), '') AS candidate_text
                    FROM (
                        SELECT
                            NULLIF(BTRIM(COALESCE(blank->>'id', '')), '') AS blank_id,
                            NULLIF(BTRIM(candidate.value), '') AS candidate_value
                        FROM jsonb_array_elements(
                            CASE
                                WHEN jsonb_typeof(data->'blanks') = 'array' THEN data->'blanks'
                                ELSE '[]'::jsonb
                            END
                        ) AS blank
                        CROSS JOIN LATERAL jsonb_array_elements_text(
                            CASE
                                WHEN jsonb_typeof(blank->'acceptedAnswers') = 'array' THEN blank->'acceptedAnswers'
                                ELSE '[]'::jsonb
                            END
                        ) AS candidate(value)
                    ) flattened_candidates
                ) accepted_candidates
                WHERE candidate_text IS NOT NULL
            ), '[]'::jsonb)
            ELSE '[]'::jsonb
        END AS accepted_answers
    FROM source
)
SELECT jsonb_build_object(
    'correctAnswer', correct_answer,
    'acceptedAnswers', accepted_answers
)
FROM normalized;
$$;

UPDATE "ProblemRevision"
SET "answerSpec" = "normalize_exact_answer_spec"("answerSpec");

DROP FUNCTION "normalize_exact_answer_spec"(JSONB);

UPDATE "Problem"
SET "problemType" = 'SHORT_TEXT'
WHERE "problemType"::text NOT IN ('SHORT_TEXT', 'GEOMETRY', 'GRAPH_DRAW');

ALTER TYPE "ProblemType" RENAME TO "ProblemType_old";

CREATE TYPE "ProblemType" AS ENUM (
    'SHORT_TEXT',
    'GEOMETRY',
    'GRAPH_DRAW'
);

ALTER TABLE "Problem"
    ALTER COLUMN "problemType" DROP DEFAULT,
    ALTER COLUMN "problemType" TYPE "ProblemType"
    USING ("problemType"::text::"ProblemType"),
    ALTER COLUMN "problemType" SET DEFAULT 'SHORT_TEXT';

DROP TYPE "ProblemType_old";

UPDATE "Problem"
SET "customId" = '__TMP__' || "id";

WITH ranked AS (
    SELECT
        p."id",
        CASE
            WHEN s."name" LIKE '%英語%' THEN 'E'
            WHEN s."name" LIKE '%数学%' THEN 'M'
            WHEN s."name" LIKE '%理科%' THEN 'S'
            WHEN s."name" LIKE '%国語%' THEN 'N'
            ELSE UPPER(LEFT(COALESCE(NULLIF(REGEXP_REPLACE(s."name", '[^A-Za-z]', '', 'g'), ''), 'X'), 1))
        END AS prefix,
        ROW_NUMBER() OVER (
            PARTITION BY p."subjectId"
            ORDER BY
                CASE WHEN p."masterNumber" IS NULL THEN 1 ELSE 0 END,
                p."masterNumber" ASC NULLS LAST,
                p."order" ASC,
                p."createdAt" ASC,
                p."id" ASC
        ) AS seq
    FROM "Problem" p
    INNER JOIN "Subject" s ON s."id" = p."subjectId"
)
UPDATE "Problem" p
SET "customId" = ranked.prefix || '-' || ranked.seq::text
FROM ranked
WHERE p."id" = ranked."id";

ALTER TABLE "Problem"
    ALTER COLUMN "customId" SET NOT NULL;
