-- Phase 2 Contract: packId カラムの DEFAULT 'jp-juken' を除去する
--
-- 目的: ContentPack 導入時（20260517000000_add_content_pack_and_pack_id）で
-- 既存データを失わずに NOT NULL 化するため、暫定的に DEFAULT 'jp-juken' を付与した。
-- 全ての新規挿入コード（seed.ts / seed-gamification.ts / createClassroom）が
-- packId を明示的に渡すように更新済みなので、DEFAULT を除去して
-- 別 pack を作成した際にうっかり jp-juken に紛れ込むのを防ぐ。

ALTER TABLE "Subject" ALTER COLUMN "packId" DROP DEFAULT;
ALTER TABLE "Classroom" ALTER COLUMN "packId" DROP DEFAULT;
ALTER TABLE "Achievement" ALTER COLUMN "packId" DROP DEFAULT;
