-- ProblemRevision に正解情報の専用カラムを追加し、既存の answerSpec JSON から backfill する。
-- これにより answerSpec は answerTemplate 専用 (描画用 DSL のみ) に縮小できる。
-- backfill 後の運用:
--   - 編集側 (createProblemDraft / publishProblemRevision) は新カラムに直接書き込む
--   - 採点側は引き続き Problem.answer / Problem.acceptedAnswers を参照する (Stage A+A+ 済)
--   - answerSpec.correctAnswer / acceptedAnswers は当面 JSON 内に残す (Stage C で削除予定)

ALTER TABLE "ProblemRevision"
ADD COLUMN "correctAnswer" TEXT,
ADD COLUMN "acceptedAnswers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 既存行の backfill: answerSpec JSON が存在する場合は correctAnswer / acceptedAnswers を抽出する。
UPDATE "ProblemRevision"
SET "correctAnswer" = NULLIF(("answerSpec"->>'correctAnswer'), '')
WHERE "answerSpec" IS NOT NULL
  AND jsonb_typeof("answerSpec"->'correctAnswer') = 'string';

-- acceptedAnswers の backfill: answerSpec.acceptedAnswers が array の場合のみ対象とする。
-- jsonb_array_elements_text は非 array に対して例外を投げるため、outer WHERE で型を保証する。
-- 文字列要素のうち空文字列でないものを集約 (NULL は jsonb_array_elements_text が SQL NULL として返すので一致する)。
UPDATE "ProblemRevision"
SET "acceptedAnswers" = COALESCE(
    (
        SELECT array_agg(elem)
        FROM jsonb_array_elements_text("answerSpec"->'acceptedAnswers') AS t(elem)
        WHERE elem IS NOT NULL
          AND elem <> ''
    ),
    ARRAY[]::TEXT[]
)
WHERE "answerSpec" IS NOT NULL
  AND jsonb_typeof("answerSpec"->'acceptedAnswers') = 'array';
