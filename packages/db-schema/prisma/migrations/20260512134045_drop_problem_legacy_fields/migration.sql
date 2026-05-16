-- Phase C 最終段: Problem の legacy フィールド (question / answer / acceptedAnswers / hasStructuredContent) を削除する。
--
-- 既に Phase A で全 Problem に publishedRevision が紐付き、Phase B で全ての読み出し系
-- (生徒画面 / 履歴 / 印刷 / AI 採点 / 管理 UI) は ProblemRevision.structuredContent /
-- correctAnswer / acceptedAnswers を一次ソースに切り替え済み。Phase C のコード変更
-- (publish/draft アクションの legacy 同期撤廃) も本番反映後 1 日 soak 済みで、
-- 16-22h JST の塾稼働中にも legacy 参照系のエラーは出ていない。
--
-- DROP は破壊的変更のため、本 migration 適用前に `scripts/backup-production-db.sh`
-- で取得した pg_dump を 30 日以上保管しておくこと。

ALTER TABLE "Problem" DROP COLUMN "question";
ALTER TABLE "Problem" DROP COLUMN "answer";
ALTER TABLE "Problem" DROP COLUMN "acceptedAnswers";
ALTER TABLE "Problem" DROP COLUMN "hasStructuredContent";
