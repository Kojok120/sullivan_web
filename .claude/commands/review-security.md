---
description: Sullivan 固有のセキュリティ観点でリポジトリをレビューする
argument-hint: "[path?]"
allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(npm run lint:*), Bash(npm run type-check:*)
---

Sullivan（Next.js 16 + Prisma + Supabase LMS）のセキュリティ観点でリポジトリをレビューする。**指摘のみ。コード修正はしない。**

## スコープ

- 引数 `$1` が空: `src/`, `prisma/`, `scripts/`, `middleware.ts` を中心にリポジトリ全体をスキャン
- 引数 `$1` がある: そのパス配下のみ対象（例: `/review-security src/app/api/grading`）

## 重要度区分

`CLAUDE.md` の `## レビュー方針` に揃える。

- **Critical**: 認可破綻、機微情報漏洩、本番障害誘発、データ破損
- **Major**: 互換性破壊、明確なバグ、入力検証欠落、外部入力をプロンプト・クエリに直結
- **Minor**: 改善余地はあるが安全側
- **Trivial**: 出さない

## チェック項目

`CLAUDE.md` の `## 公式ベストプラクティス`（Next.js / Supabase SSR）と `## Sullivan での具体的判断基準` を前提に、以下を機械的に確認する。

### 1. 認証・認可

- Server Actions / Route Handlers の冒頭で `requireAdmin` / `requireTeacher` / `requireProblemAuthor` 等のガード（`src/lib/authorization.ts`、`src/lib/auth.ts`）が呼ばれているか
- ロール判定が `user.app_metadata.role` 基準か。`user_metadata.role` を信頼していないか
- クライアントから渡る `role` / `userId` / `studentId` を検証なしで Prisma の `where` に突っ込んでいないか
- `middleware.ts` の保護対象パスが網羅されているか

### 2. Webhook / Cloud Tasks

- `src/app/api/grading/webhook/route.ts` などで Drive channel ID + token を DB の状態と突合しているか。タイミング攻撃耐性（早期 return）。トークンが `console.log` / `console.error` に出ていないか
- `src/app/api/queue/grading/route.ts`、`src/app/api/queue/drive-check/route.ts` で Cloud Tasks ヘッダ（`X-CloudTasks-*`）または `internal-api-auth.ts` 経由の検証があるか

### 3. AI プロンプト（Gemini）

- `src/lib/guidance-summary.ts`、`src/lib/tutor-chat.ts`、`src/app/api/tutor-chat/route.ts`、`src/app/api/gemini-live/token/route.ts` で、ユーザー入力をシステムプロンプトに直接連結していないか
- システムプロンプトとユーザー入力の境界が `role` で分離されているか
- `gemini-live/token` で発行するトークンのスコープ・寿命が最小か

### 4. Drive / 外部 API

- `src/lib/drive-client.ts`、`src/lib/drive-watch-api.ts` の OAuth スコープが必要最小か
- Drive ファイル ID をクライアント任意で受け取って権限確認なしに読みに行っていないか

### 5. PDF / Print

- `src/lib/print-pdf/`、`src/lib/print-document.ts` で Puppeteer に渡す URL／HTML がユーザー入力由来でないか（SSRF）
- テンプレートに生徒データを HTML エスケープなしで差し込んでいないか（XSS）

### 6. 環境変数 / Secret

- `SUPABASE_SERVICE_ROLE_KEY` 等のサーバ専用 Secret が Client Component / `NEXT_PUBLIC_` 経由で参照されていないか
- ログ・例外メッセージに Bearer / token / cookie が含まれていないか

### 7. 入力検証

- Server Action / Route Handler の入口で zod 検証があるか（`react-hook-form` + zod 規約）
- フォームから来る `FormData` を型キャストで素通ししていないか

### 8. Prisma

- `$queryRaw` / `$executeRaw` を使っている箇所で、テンプレートリテラル経由で外部入力を結合していないか（`Prisma.sql` でパラメタライズされているか）

## 対象外

- 命名スタイル、コメント、フォーマッタ由来の差分
- CSP / セキュリティヘッダ（インフラ層・別運用）
- 依存パッケージの脆弱性（`npm audit` で別途）

## 出力フォーマット

重要度ごとに見出しを立て、各項目を以下の体裁で出す:

```
- `path/to/file.ts:42` — <一行要約>
  抜粋: `<該当コード短い抜粋>`
  対処: <推奨アクション 1〜3 行>
```

## 完了報告

末尾に必ず次を出す:

- 重要度別の件数（Critical / Major / Minor）
- 最初に着手すべき 1〜3 件（順序つき）
- 「Critical / Major が 0 件なら本 PR に対するセキュリティ観点のブロッカーは無し」という総合判定
