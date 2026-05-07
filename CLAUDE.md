# Sullivan プロジェクト Claude 指示

このファイルは Claude 向けのガイドですが、内容は root `AGENTS.md` と同等です。
配下に `AGENTS.md` がある場合は、その領域固有ルールもあわせて従ってください。

## プロジェクト概要

Sullivan は Next.js 16 (App Router) ベースの**学習管理システム（LMS）**です。
生徒の学習進捗管理、AI を活用した自動採点・フィードバック、忘却曲線に基づく復習優先度の計算、個別最適化された教材のプリント出力機能を提供します。

このファイルはリポジトリ全体に共通する実装原則を定義します。
`src/AGENTS.md`、`src/lib/AGENTS.md`、`src/app/api/AGENTS.md`、`prisma/AGENTS.md` など配下の `AGENTS.md` が存在する場合は、その領域固有ルールもあわせて従ってください。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **スタイリング**: Tailwind CSS v4 + shadcn/ui (Radix UI)
- **ORM**: Prisma (PostgreSQL)
- **認証**: Supabase Auth (SSR) — `@supabase/ssr`
- **AI**: Google Gemini API (`@google/genai`)
- **外部サービス**: Google Drive API, Google Cloud Tasks, Supabase Realtime
- **デプロイ**: Google Cloud Run (Docker)
- **CI/CD**: GitHub Actions

## 実装原則の優先順位

実装判断に迷った場合は、次の優先順で決定してください。

1. **正しさ・セキュリティ・データ整合性**
2. **フレームワーク制約・既存アーキテクチャとの整合**
3. **KISS**
4. **YAGNI**
5. **DRY**

補足:

- `DRY` は常に最優先ではありません。責務が安定していて共有価値がある重複だけに適用します。
- 早すぎる抽象化よりも、正しく安全で追いやすい実装を優先します。

## KISS / YAGNI / DRY

### KISS

- 1 変更 1 責務を基本にする
- 認証、権限判定、DB 更新、UI 表示の責務を同じ関数やコンポーネントに混ぜない
- 小さな関数、素直な条件分岐、短いデータフローを優先する
- 使わない抽象化、設定、ラッパー、ヘルパーを増やさない

### YAGNI

- 今の要件で使わない拡張ポイント、未使用 props、オプション引数、将来用フラグを追加しない
- 未確定な複数ユースケースのために先回りした汎用化をしない
- 将来必要になるかもしれない、だけを理由に API や型を広げない

### DRY

- 安定したビジネスルール、認可ロジック、Zod schema、共通クエリ条件、定数は 1 箇所に寄せる
- 見た目が似ているだけで責務が違うコードは共通化しない
- 「同じ入力・同じ責務・同じ変更理由を共有する重複」だけを DRY の対象にする
- 共有後に呼び出し側が複雑になるなら、共通化を見送る

## 公式ベストプラクティス

以下は、このプロジェクトの採用技術に直接関係する公式ドキュメントをもとにした実装方針です。

### Next.js

- App Router では **Server Components をデフォルト** にし、`"use client"` は state、event handler、browser API が必要な箇所だけに限定する
- Client 境界は小さく保ち、親ツリー全体を不要に Client Component 化しない
- フォーム送信は可能な限り `<form action={serverAction}>` を使い、Server Action 側で検証する
- 外部公開 API、Webhook、外部連携受信は Route Handler に置く
- 認証やデータ更新は server-side を基準に設計し、クライアントからの値をそのまま信頼しない

### React

- render は pure に保ち、props、state、context を mutate しない
- 派生値は state に持たず、render 中に計算する
- props を安易に state にミラーしない
- `useEffect` は外部システム同期だけに使い、派生計算やイベント処理には使わない
- client state は最小にし、矛盾状態や重複状態を作らない

### TypeScript

- 既存の `strict: true` を前提に、`any` と無根拠な型アサーションを避ける
- `null` / `undefined` は明示的に扱う
- Server Action 入出力、API response、認証 payload、外部サービス response の型を曖昧な `object` や広すぎる union にしない
- 境界面では zod などの runtime validation と型定義をセットで考える

### Prisma

- `select` / `include` を明示し、必要な列だけ取得する
- 深い relation 読み込みは必要時だけにし、N+1 や過剰取得を避ける
- 一覧系は pagination を前提にする
- 複数書き込みが 1 単位で成功/失敗すべき場合だけ `$transaction()` を使い、transaction は短く保つ

### Supabase SSR

- browser client と server client を分ける
- SSR では cookie ベースの client を使う
- middleware / proxy で session refresh を扱い、Server Components / Server Actions 側はその前提で実装する
- ロール判定は `user.app_metadata.role` を基準に扱い、権限に関わる値を client 側 metadata に依存しない

## Sullivan での具体的判断基準

- Server Action は **認証確認 → ロール確認 → Zod 検証 → Prisma 更新 → 必要な再取得** の順を基本形にする
- Client Component 化の前に「本当に client state が必要か」を確認する
- 新しい helper や service を作る前に、既存の `src/lib` / `src/app` / `src/components` に同責務の実装がないか確認する
- Prisma query は `include` / `select` の理由が説明できないものを増やさない
- 役割ごとの責務を崩さない
  - `src/app`: 画面、Route Handler、Server Actions
  - `src/components`: UI 表現
  - `src/lib`: ビジネスロジック、外部連携、共通ユーティリティ
- 問題を局所化して直せるなら、まず局所修正を選ぶ
- 将来の一般化より、現在のユースケースに対する可読性と保守性を優先する

## コーディング規約

### 言語とスタイル

- コメントおよびドキュメントは**日本語**で記述する
- コミットメッセージは **Conventional Commits 1.0.0** に準拠し、日本語で記述する
  - 例: `feat: ユーザー検索機能を追加`
- 絵文字は使わない
- ヘッダー行の末尾に句点を付けない

### 認証とセキュリティ

- 認証は `@supabase/ssr` の `createClient` を使用する
- ロール情報は `user.app_metadata.role` で管理する
- ロール種別は `STUDENT`, `TEACHER`, `HEAD_TEACHER`, `PARENT`, `ADMIN`
- Server Actions では必ずセッション検証とロールチェックを行う

### データベース操作

- データベースアクセスは必ず **Prisma クライアント**経由で行う
- データ更新は **Server Actions** または server-side の安全な入口から実行する
- N+1 問題に注意し、必要な `include` / `select` を明示する
- 複数テーブル更新で整合性が必要な場合のみ transaction を使う

### コンポーネント設計

- React Server Components (RSC) をデフォルトとする
- インタラクティブなコンポーネントのみ `"use client"` を使用する
- UI コンポーネントは `shadcn/ui` + Radix UI をベースに構築する
- フォームは `react-hook-form` + `zod` バリデーションを基本とする

## レビュー方針

- `head=dev` かつ `base=main` の PR は、リリース反映用の同期 PR として扱う
- 上記の同期 PR でも通常どおりレビューと静的確認を実行する
- 上記の同期 PR で投稿する指摘は `Critical` / `Major` に該当するものだけに限定し、`Minor` / `Trivial` は投稿しない
- 重要度は本番反映の安全性を基準に判定し、セキュリティ事故、データ破損、障害誘発、互換性破壊、リリース阻害につながる問題を `Critical` / `Major` として扱う
- 上記以外の PR では通常どおりコードレビューを行う

## 主要ディレクトリ

```text
src/
├── app/           # ページ・ルーティング・Server Actions
├── components/    # UIコンポーネント
└── lib/           # コアロジック・ユーティリティ
prisma/
├── schema.prisma  # データベーススキーマ
└── migrations/    # マイグレーションファイル
scripts/           # 管理・メンテナンス用スクリプト
```

## 開発コマンド

```bash
npm run dev           # Web 開発サーバー起動
npm run dev:worker    # Worker 開発サーバー起動
npm run build         # Web 本番ビルド
npm run start         # Web 本番起動
npm run start:worker  # Worker 本番起動
npm run lint          # ESLint 実行
npm run type-check    # TypeScript 型チェック
npm test              # ユニットテスト
npm run test:coverage # カバレッジ付きユニットテスト
npm run test:e2e      # Playwright E2E テスト
npx prisma generate   # Prisma クライアント再生成
npx prisma migrate dev # Prisma マイグレーション実行（開発）
npx prisma studio     # Prisma Studio
```

## 環境変数

開発環境の設定は `.env.local` を使用します。主要な環境変数:

- `DATABASE_URL` / `DIRECT_URL` — PostgreSQL 接続情報
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 公開設定
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 管理者キー
- `GEMINI_API_KEY` — Google Gemini API キー

## デプロイ

GitHub Actions による自動デプロイ運用に移行済み。ローカルから `.sh` を直接叩く運用ではない。

- **DEV 環境**: `dev` ブランチへの push で `.github/workflows/deploy-dev.yml` が起動し、DB マイグレーション → Grading Worker → Web App の順で Cloud Run にデプロイされる
- **本番環境**: `main` ブランチへの push で `.github/workflows/deploy-production.yml` が起動し、同様に DB マイグレーション → Worker → Web App がデプロイされ、最後に Discord 通知が出る
- main へのマージは `dev` ブランチからの PR に制限されている（`restrict-main-merge-source.yml`）
- 各ワークフロー内部で `deploy-web-DEV.sh` / `deploy-web-PRODUCTION.sh` / `deploy-grading-worker-*.sh` を実行している。スクリプト自体は CI 経由の利用が前提
- ビルド時環境変数とランタイム環境変数は分離管理する
- 詳細な前提（Cloud Tasks キュー、Secret Manager、Drive Watch、Supabase Realtime publication）は [`docs/deploy_runbook.md`](./docs/deploy_runbook.md) を参照

## 参考にした公式ドキュメント

- Next.js: [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Next.js: [How to create forms with Server Actions](https://nextjs.org/docs/app/guides/forms)
- Next.js: [How to implement authentication in Next.js](https://nextjs.org/docs/app/guides/authentication)
- Next.js: [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- React: [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- React: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- React: [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- React: [useActionState](https://react.dev/reference/react/useActionState)
- TypeScript: [strict](https://www.typescriptlang.org/tsconfig/strict.html)
- TypeScript: [strictNullChecks](https://www.typescriptlang.org/tsconfig/strictNullChecks.html)
- Prisma: [Select fields](https://www.prisma.io/docs/orm/prisma-client/queries/select-fields)
- Prisma: [Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- Prisma: [Pagination](https://www.prisma.io/docs/orm/prisma-client/queries/pagination)
- Supabase: [Creating a Supabase client for SSR (Next.js)](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
