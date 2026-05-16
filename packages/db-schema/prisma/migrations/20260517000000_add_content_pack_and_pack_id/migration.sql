-- Phase 2: ContentPack モデル導入と packId カラム追加
--
-- 目的: 1 リポジトリで複数プロダクト（jp / nihongo / bd）の教科・教室・実績を
-- 共存させるため、Subject / Classroom / Achievement に packId スコープを導入する。
-- 既存レコードは全て jp-juken ContentPack 配下として扱う。
--
-- 段階適用:
-- 1. ContentPack テーブル作成
-- 2. jp-juken の初期 ContentPack レコードを挿入（既存データを失わない）
-- 3. Subject / Classroom / Achievement に packId カラム追加（DEFAULT 'jp-juken'）
-- 4. 既存ユニーク制約（name / slug 単独）を破棄し、複合ユニーク（[packId, name|slug]）を作成
-- 5. 外部キー / インデックス追加
--
-- DEFAULT 'jp-juken' は本マイグレーションでは維持し、新規挿入コードが
-- 全て packId を明示的に渡すようになってから別マイグレーションで除去する。

-- 1. ContentPack 本体
CREATE TABLE "ContentPack" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "productId"  TEXT NOT NULL DEFAULT 'jp',
  "locale"     TEXT NOT NULL DEFAULT 'ja-JP',
  "curriculum" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentPack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentPack_productId_idx" ON "ContentPack" ("productId");

-- 2. jp-juken の初期 pack を seed（既存データのバックフィル先）
INSERT INTO "ContentPack" ("id", "name", "productId", "locale", "curriculum", "createdAt", "updatedAt")
VALUES ('jp-juken', '日本5教科受験対策', 'jp', 'ja-JP', '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. Subject に packId 追加
ALTER TABLE "Subject" ADD COLUMN "packId" TEXT NOT NULL DEFAULT 'jp-juken';

-- 既存の Subject_name_key（name 単独 unique）を drop して
-- 複合 unique [packId, name] に置き換え
ALTER TABLE "Subject" DROP CONSTRAINT IF EXISTS "Subject_name_key";
DROP INDEX IF EXISTS "Subject_name_key";
CREATE UNIQUE INDEX "Subject_packId_name_key" ON "Subject" ("packId", "name");
CREATE INDEX "Subject_packId_idx" ON "Subject" ("packId");

ALTER TABLE "Subject"
  ADD CONSTRAINT "Subject_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "ContentPack" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- 4. Classroom に packId 追加
ALTER TABLE "Classroom" ADD COLUMN "packId" TEXT NOT NULL DEFAULT 'jp-juken';

ALTER TABLE "Classroom" DROP CONSTRAINT IF EXISTS "Classroom_name_key";
DROP INDEX IF EXISTS "Classroom_name_key";
CREATE UNIQUE INDEX "Classroom_packId_name_key" ON "Classroom" ("packId", "name");
CREATE INDEX "Classroom_packId_idx" ON "Classroom" ("packId");

ALTER TABLE "Classroom"
  ADD CONSTRAINT "Classroom_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "ContentPack" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- 5. Achievement に packId 追加
ALTER TABLE "Achievement" ADD COLUMN "packId" TEXT NOT NULL DEFAULT 'jp-juken';

ALTER TABLE "Achievement" DROP CONSTRAINT IF EXISTS "Achievement_slug_key";
DROP INDEX IF EXISTS "Achievement_slug_key";
CREATE UNIQUE INDEX "Achievement_packId_slug_key" ON "Achievement" ("packId", "slug");
CREATE INDEX "Achievement_packId_idx" ON "Achievement" ("packId");

ALTER TABLE "Achievement"
  ADD CONSTRAINT "Achievement_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "ContentPack" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;
