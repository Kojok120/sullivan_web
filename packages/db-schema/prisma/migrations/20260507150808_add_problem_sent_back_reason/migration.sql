-- 差し戻し理由カラムを追加。NULL 許容、既存行は NULL のまま。
ALTER TABLE "Problem" ADD COLUMN "sentBackReason" TEXT;
