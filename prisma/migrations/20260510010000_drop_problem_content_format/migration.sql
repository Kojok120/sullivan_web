-- 段階C: ProblemContentFormat enum と Problem.contentFormat カラムを撤廃する。
--
-- 段階A+ 以降「構造化問題か」は publishedRevision.structuredContent の有無で判定しており、
-- contentFormat は本番ロジックから完全に参照されなくなっている。
-- フィルタ UI / 表示バッジ / 監査スクリプト等の付随機能を撤去するのに合わせ、
-- DB スキーマ側でも安全に列と enum 型を削除する。

ALTER TABLE "Problem" DROP COLUMN "contentFormat";

DROP TYPE "ProblemContentFormat";
