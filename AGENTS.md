# Sullivan プロジェクト エージェント指示

## プロジェクト概要

Sullivan は Next.js 16 (App Router) ベースの**学習管理システム（LMS）**です。
生徒の学習進捗管理、AIを活用した自動採点・フィードバック、忘却曲線に基づく復習優先度の計算、個別最適化された教材のプリント出力機能を提供します。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **スタイリング**: Tailwind CSS v4 + shadcn/ui (Radix UI)
- **ORM**: Prisma (PostgreSQL)
- **認証**: Supabase Auth (SSR) — `@supabase/ssr`
- **AI**: Google Gemini API (`@google/generative-ai`)
- **外部サービス**: Google Drive API, Google Cloud Tasks, Supabase Realtime
- **デプロイ**: Google Cloud Run (Docker)
- **CI/CD**: GitHub Actions

## コーディング規約

### 言語とスタイル
- コメントおよびドキュメントは**日本語**で記述
- コミットメッセージは **Conventional Commits 1.0.0** に準拠（日本語）
  - 例: `feat: ユーザー検索機能を追加`
  - 絵文字不使用、ヘッダー末尾の句点不要

### データベース操作
- データベースアクセスは必ず **Prisma クライアント**経由
- データ操作は **Server Actions** (`"use server"`) で実装
- N+1 問題に注意し、必要な `include` / `select` を明示

### 認証とセキュリティ
- 認証は `@supabase/ssr` の `createClient` を使用
- ロール情報は `user.app_metadata.role` で管理（STUDENT, TEACHER, HEAD_TEACHER, PARENT, ADMIN）
- Server Actions では必ずセッション検証とロールチェックを行う

### コンポーネント設計
- React Server Components (RSC) をデフォルトとし、インタラクティブなコンポーネントのみ `"use client"` を使用
- UI コンポーネントは `shadcn/ui` + Radix UI をベースに構築
- フォームには `react-hook-form` + `zod` バリデーションを使用

## Review guidelines

- `head=dev` かつ `base=main` のPRは、リリース反映用の同期PRとして扱う
- 上記の同期PRでは Codex のレビューを実行せず、指摘コメントや修正提案を投稿しない
- 上記以外のPRでは通常どおりコードレビューを行う

## 主要ディレクトリ

```
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
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド
npx next lint        # ESLint 実行
npx tsc --noEmit     # 型チェック
npx prisma generate  # Prisma クライアント再生成
npx prisma migrate dev  # マイグレーション実行（開発）
npx prisma studio    # データベースGUI
```

## 環境変数

開発環境の設定は `.env.local` を使用。主要な環境変数:
- `DATABASE_URL` / `DIRECT_URL` — PostgreSQL 接続情報
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase公開設定
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase管理者キー
- `GEMINI_API_KEY` — Google Gemini API キー

## デプロイ

- **DEV環境**: `./deploy-web-DEV.sh`
- **本番環境**: `./deploy-web-PRODUCTION.sh`
- いずれも Google Cloud Run へ Docker イメージをデプロイ
- ビルド時環境変数とランタイム環境変数は分離管理
