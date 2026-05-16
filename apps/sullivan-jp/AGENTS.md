# apps/sullivan-jp エージェント指示

## 現状 (Phase 1.7.a 時点)

このディレクトリは Phase 1.7 で導入された**scaffold**で、アプリの実体 (src/, server.ts, worker/, middleware.ts, next.config.ts, Dockerfile 系, public/ 等) はまだ **repository root に置かれている**。

`package.json` / `tsconfig.json` だけが先に置かれており、pnpm workspace に `sullivan-jp` パッケージとして認識される状態を作っている。

## 次のステップ (Phase 1.7.b 以降)

1. **物理移動 (Phase 1.7.b)**
   - `src/` → `apps/sullivan-jp/src/`
   - `server.ts`, `middleware.ts`, `worker/`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `next-env.d.ts` → `apps/sullivan-jp/`
   - `vitest.config.ts`, `vitest.setup.ts` → `apps/sullivan-jp/` (1.7.b5 で src/ と同時移動)
   - `playwright.config.ts`, `playwright.prod.config.ts`, `e2e/` → `apps/sullivan-jp/` (1.7.b2 で移動済)
   - `public/`, `instructions/`, `math_problems_originals/` → `apps/sullivan-jp/`
   - `manual_admin/`, `manual_student/`, `manual_teacher/` → `apps/sullivan-jp/` (1.7.b1 で移動済)

2. **Docker / CI 移動 (Phase 1.7.c)**
   - `Dockerfile` → `apps/sullivan-jp/Dockerfile.web`
   - `Dockerfile.worker` → `apps/sullivan-jp/Dockerfile.worker`
   - `Dockerfile.web-base`, `Dockerfile.worker-base`, `cloudbuild.*.yaml` も同梱
   - `deploy-web-*.sh`, `deploy-grading-worker-*.sh` を path 対応化
   - `.github/workflows/*.yml` の `working-directory` / `paths-filter` を更新

3. **Import site 移行 (Phase 1.7.d)**
   - `src/lib/*` に残る re-export shim を消し、import site (`apps/sullivan-jp/src/...`) を直接 `@sullivan/*` から import するように書き換え
   - 完了条件: `apps/sullivan-jp/src/lib/` の行数が、現 `src/lib/` の 30% 以下になる

## 規約 (将来用)

物理移動完了後、本ディレクトリ配下では以下のルールを敷く想定。

- `@/*` パスエイリアスは `apps/sullivan-jp/src/*` を指す
- 共通ロジックは `@sullivan/*` workspace package から import する。`@/lib/*` 経由の薄い shim は作らない
- Next.js, React, TypeScript の規約は root `AGENTS.md` に従う
