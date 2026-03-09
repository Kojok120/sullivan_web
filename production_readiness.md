# Production Readiness Checklist

本番環境（Production）へのリリースに向けて必要な改修・確認項目です。

## 1. インフラ・環境設定
- [ ] **環境変数の設定**
    - 本番環境（Vercelなど）に以下の環境変数を設定する。
        - `DATABASE_URL`
        - `DIRECT_URL`
        - `NEXT_PUBLIC_SUPABASE_URL`
        - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
        - `SUPABASE_SERVICE_ROLE_KEY`
        - `GEMINI_API_KEY`
        - `DRIVE_FOLDER_ID`
        - `APP_URL`
        - `GOOGLE_CLOUD_PROJECT_ID`
        - `CLOUD_TASKS_LOCATION`
        - `GRADING_TASK_QUEUE` / `DRIVE_CHECK_TASK_QUEUE`
        - `CLOUD_TASKS_CALLER_SERVICE_ACCOUNT`
        - `INTERNAL_API_SECRET` (必要に応じて)
        - `DRIVE_WEBHOOK_CHANNEL_ID` (必要に応じて)
        - `DRIVE_WEBHOOK_TOKEN` (Webhook検証用)
        - `GOOGLE_APPLICATION_CREDENTIALS` (本番でシークレットをマウントする場合)
        - `GRADING_WORKER_URL` (採点ワーカーを別サービスに分離する場合)
- [ ] **データベース**
    - 本番用データベース（PostgreSQLなど）の構築。
    - マイグレーションの実行（`npx prisma migrate deploy`）。
- [ ] **ドメイン設定**
    - カスタムドメインの取得とDNS設定。

## 2. セキュリティ強化
- [ ] **HTTPヘッダー**
    - `next.config.ts` にセキュリティヘッダー（CSP, X-Frame-Options, X-Content-Type-Optionsなど）を追加する。
- [ ] **Cookie設定**
    - Supabase AuthのCookie設定を確認し、必要に応じて `src/lib/supabase/server.ts` / `src/lib/supabase/middleware.ts` で `sameSite` / `secure` を明示する。
- [ ] **内部エンドポイント保護**
    - `/api/grading/check` 用に `INTERNAL_API_SECRET` を設定する。
    - Webhookの検証が必要な場合は `DRIVE_WEBHOOK_TOKEN` を設定する。
- [ ] **レート制限**
    - 過剰なリクエストを防ぐためのレート制限（Rate Limiting）をMiddleware等で導入する。

## 3. パフォーマンス・スケーラビリティ
- [ ] **DBインデックス**
    - `prisma/schema.prisma` で、頻繁に検索されるカラム（`LearningHistory` の `userId`, `problemId` など）にインデックスを追加する。
- [ ] **画像最適化**
    - `next/image` を活用する。
    - 必要に応じて `next.config.ts` に外部画像のドメイン許可設定を追加する。
- [ ] **キャッシュ戦略**
    - 静的コンテンツのキャッシュ設定や、ISR（Incremental Static Regeneration）の活用を検討する。

## 4. 監視・信頼性
- [ ] **エラーログ監視**
    - Sentryなどのエラートラッキングツールを導入し、本番環境でのクラッシュやエラーを検知できるようにする。
- [ ] **構造化ログ**
    - サーバーサイドのログをJSON形式などの構造化ログに変更し、分析しやすくする（Pinoなどのライブラリ導入検討）。
- [ ] **Supabase Realtime (通知)**
    - Realtime用のPostgres Replicationを有効化し、`realtime_events` テーブルを `supabase_realtime` publication に追加する。
    - `realtime_events` にRLSを有効化し、`app_metadata.prismaUserId` と `user_id` が一致する行のみSELECT可能にする。

## 5. UX・品質向上
- [ ] **エラーページ**
    - `error.tsx`（システムエラー用）を作成する。
    - `not-found.tsx`（404エラー用）を作成する。
- [ ] **メタデータ**
    - `src/app/layout.tsx` の `metadata` を更新し、適切なタイトル、説明文、OGP画像を設定する。
- [ ] **アクセシビリティ**
    - `src/app/layout.tsx` の `html` タグの `lang` 属性を `ja` に変更する。

## 6. 法的・コンプライアンス
- [ ] **利用規約・プライバシーポリシー**
    - ユーザー登録時に同意を求めるためのページとフローを作成する。
