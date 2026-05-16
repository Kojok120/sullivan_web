-- Problem.customId の自然順ソートキーを STORED 生成カラムに切り替え、
-- Prisma の orderBy だけで完結させる（関数式 index ベースの $queryRaw + IN (...) 経路を廃止）。
-- これにより「全件 ID 取得 → IN (...) raw SQL → 再 findMany」の 3 ラウンドトリップを 1 クエリに圧縮できる。

ALTER TABLE "Problem"
    ADD COLUMN "customIdSortKey" TEXT
    GENERATED ALWAYS AS (public.problem_custom_id_sort_key("customId")) STORED;

-- 既存の関数式 index は generated column 上の通常 index に置き換えるため不要になる。
DROP INDEX IF EXISTS "Problem_customId_natural_idx";

CREATE INDEX "Problem_customIdSortKey_id_idx"
    ON "Problem" ("customIdSortKey", "id");
