-- Phase D: ProblemRevision に検索用 denormalized テキストカラムを追加し、
-- pg_trgm GIN index で管理画面の問題検索 (ILIKE) を高速化する。

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "ProblemRevision" ADD COLUMN "searchText" TEXT;

CREATE INDEX "ProblemRevision_searchText_trgm_idx"
  ON "ProblemRevision"
  USING gin ("searchText" gin_trgm_ops);
