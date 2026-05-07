-- 差し戻し理由カラムを VARCHAR(500) に制限し、DB レベルで長さ制約を強制する。
ALTER TABLE "Problem" ALTER COLUMN "sentBackReason" TYPE VARCHAR(500);
