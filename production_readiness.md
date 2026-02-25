# Production Readiness Checklist

本番環境（Production）へのリリースに向けて必要な確認・改修項目です。
✅ はコード上すでに対応済みの項目を示します。

---

## 1. インフラ・環境設定

### 環境変数
- [ ] Cloud Run（本番）に以下の環境変数がすべて設定されていることを確認する。
    - `DATABASE_URL` / `DIRECT_URL`（PrismaのPostgreSQL接続）
    - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `GEMINI_API_KEY`（`GEMINI_MODEL` は省略可）
    - `DRIVE_FOLDER_ID`
    - `APP_URL`（本番ドメインを設定、Drive Webhook URLの生成に使用）
    - `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`
    - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
    - `INTERNAL_API_SECRET`（Secret Managerで管理）
    - `DRIVE_WEBHOOK_TOKEN`（Secret Managerで管理）
    - `DRIVE_WEBHOOK_CHANNEL_ID`
    - `GRADING_WORKER_URL`（採点ワーカーを別サービスに分離する場合）
    - `GOOGLE_APPLICATION_CREDENTIALS`（Service Accountをマウントする場合）
- [ ] **`.env.local` / `.env.build` など開発用のシークレットファイルが `.gitignore` に含まれており、リポジトリに混入していないことを確認する。**
    - `service-account.json` 等のGoogle認証情報ファイルがリポジトリ内に存在しないことも確認すること。（参照: `docs/cto_architecture_review.md`）

### データベース
- [ ] 本番用PostgreSQLが構築されており、接続確認が完了している。
- [ ] マイグレーションを実行する（`npx prisma migrate deploy`）。
- [ ] 採点ワーカー用データベース接続設定も同様に確認する。

### Cloud Run設定
- [ ] インスタンスの最小/最大数、メモリ（推奨: 1GB以上）、タイムアウト（採点処理に合わせ 60-120秒）を適切に設定する。
- [ ] Cloud Run Service Accountに必要な権限（Secret Managerアクセス、Drive API等）が付与されていることを確認する。

### ドメイン設定
- [ ] カスタムドメインの取得とDNS設定が完了している。
- [ ] HTTPS（TLS）が有効になっていることを確認する（Cloud Runは標準で提供）。

---

## 2. セキュリティ

### HTTPセキュリティヘッダー
- ✅ `next.config.ts` に基本的なセキュリティヘッダーを設定済み（`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-XSS-Protection`）。
- [ ] **`Content-Security-Policy (CSP)` ヘッダーを `next.config.ts` に追加する。** Supabase, Google Fonts, Gemini等の外部ドメインを `script-src` / `connect-src` に適切に指定すること。
- [ ] **`Strict-Transport-Security (HSTS)` ヘッダーを追加する**（`max-age=63072000; includeSubDomains`）。
- [ ] **`Permissions-Policy` ヘッダーを追加する**（不要なブラウザ機能へのアクセスを制限）。

### 認証・認可
- ✅ ロール情報は `user.app_metadata.role` のみから読み取るよう実装済み（`src/lib/auth.ts`, `src/proxy.ts`）。`user_metadata` へのフォールバックは削除されている。
- ✅ ミドルウェア（`src/middleware.ts` / `src/proxy.ts`）でロール別ルートガード（`/admin`, `/teacher`）を実装済み。
- ✅ 強制パスワード変更フロー（`/force-password-change`）が実装済み。
- [ ] **Supabase ダッシュボードで、学習塾の生徒・講師アカウント等が本番用プロジェクトに登録されていることを確認する。**

### Cookie設定
- [ ] Supabase Auth のCookieに `Secure` フラグ・`SameSite=Lax`（または `Strict`）が設定されていることを確認する（`src/lib/supabase/server.ts`、`src/lib/supabase/middleware.ts`）。

### 内部APIエンドポイント保護
- ✅ `/api/grading/check` は `INTERNAL_API_SECRET` でBearerトークン認証済み（`src/lib/drive-watch-api.ts: verifyInternalApiAuthorization`）。
- ✅ `INTERNAL_API_SECRET` / `DRIVE_WEBHOOK_TOKEN` は Cloud Run Secret Manager 経由でマウント済み（`deploy-web-PRODUCTION.sh`）。
- [ ] `DRIVE_WEBHOOK_TOKEN` を使った `x-goog-channel-token` の検証が Drive Webhook受信ルート（`src/app/api/grading/webhook/route.ts`）で実装されていることを確認する。
- [ ] **QStash署名検証が実装されていることを確認する**（`src/app/api/queue/grading/route.ts` で `@upstash/qstash` の署名検証を使用しているか確認）。

### レート制限
- [ ] **認証エンドポイント（`/login`）および AI チャット（`/api/tutor-chat`）、採点Webhook（`/api/grading/webhook`）に対してレート制限を実装する。** Upstash Redis（`@upstash/ratelimit`）をMiddlewareで利用することを推奨。

### Google Drive連携
- [ ] **Drive Webhook で `pageToken` を使用したページネーションが実装されており、1度のチェックで全ファイルを取得できることを確認する。** 10件以上のファイルが同時投入された際の取りこぼしがないか検証する。

### データアクセス制御（Supabase RLS）
- [ ] **`realtime_events` テーブルにRow Level Security (RLS) が有効化されており、`app_metadata.prismaUserId` と `user_id` が一致する行のみSELECT可能になっていることを確認する。**
- [ ] 他の直接アクセスされうるテーブルにも適切なRLSポリシーが設定されていることを確認する。

---

## 3. パフォーマンス・スケーラビリティ

### データベースインデックス
- ✅ `LearningHistory` に `@@index([userId, answeredAt(sort: Desc)])` が設定済み。
- ✅ `RealtimeEvent` に `@@index([userId, createdAt])` が設定済み。
- ✅ `GradingJob` に `@@index([status, updatedAt])` が設定済み。
- [ ] `UserProblemState`（`userId`, `problemId` で頻繁にクエリされる）が `@@unique([userId, problemId])` のみであることを確認し、クエリパターンによって追加インデックスが必要か検討する。
- [ ] `User` テーブルの `classroomId` カラムに対するフィルタリングが頻繁に行われる場合、インデックス追加を検討する。

### 採点処理の安定性
- ✅ `GradingJob` テーブルに `fileId` のUniqueインデックスが設定されており、冪等性（重複処理防止）が担保されている。
- [ ] **採点ワーカーを Cloud Run の別サービスとして分離することを検討する**（参照: `docs/cto_architecture_review.md` §5.2）。分離することで、WebアプリのAPI Routeがタイムアウトするリスクを回避できる。
- [ ] 採点処理のリトライ設定（QStashの再試行回数・間隔）が適切に設定されていることを確認する。

### キャッシュ戦略
- [ ] Server Actionsやデータ取得処理で `React cache()` や `unstable_cache` が適切に活用されているかを確認し、不要なDB呼び出しを削減する。
- [ ] 静的に配信できるアセット（フォント、アイコン等）が適切にキャッシュされていることを確認する。

### 画像最適化
- [ ] `next/image` を活用する（現在 `<img>` タグを直接使っている箇所がある場合は置き換える）。
- [ ] `next.config.ts` に外部画像のドメイン許可設定を追加する（必要な場合）。

---

## 4. 監視・信頼性

### エラー監視
- [ ] **Sentryなどのエラートラッキングツールを導入する**。`sentry.server.config.ts` / `sentry.client.config.ts` を設定し、本番環境でのクラッシュやエラーを即時検知できるようにする。
- [ ] Cloud Run の Cloud Logging でサーバーログが確認できることを検証する。

### 構造化ログ
- [ ] `console.log` / `console.error` をPino等の構造化ログライブラリに置き換え、Cloud Loggingでフィルタリング・検索しやすくすることを検討する。

### Supabase Realtimeの設定
- [ ] **Supabase ダッシュボードで `realtime_events` テーブルが `supabase_realtime` publication に追加されていることを確認する。**（参照: `production_readiness.md` §4、`src/lib/realtime-events.ts`）
- [ ] Realtime接続が正常に動作することを、本番環境で採点フローを1件実施してエンドツーエンドで検証する。

### バックアップとリカバリ
- [ ] PostgreSQL データベースの自動バックアップが設定されていることを確認する（Supabase の自動バックアップ設定を確認）。
- [ ] バックアップからのリストア手順が文書化されていることを確認する。

---

## 5. UX・品質向上

### エラーページ
- [ ] **`src/app/error.tsx`（グローバルエラーバウンダリ）を作成する。** Next.js App Routerの `error.tsx` として実装し、ユーザーに分かりやすいエラーメッセージとリロードボタンを提供する。
- [ ] **`src/app/not-found.tsx`（404エラーページ）を作成する。** ホームへのリンクを含む、UXに配慮したデザインにすること。

### メタデータとSEO
- [ ] **`src/app/layout.tsx` の `metadata` を更新する**。`title: "Sullivan"` / `description: "Sullivan Learning System"` を実際のサービス名・説明に変更し、OGP画像（`opengraph-image`）も設定する。

### アクセシビリティ
- [ ] **`src/app/layout.tsx` の `<html lang="en">` を `<html lang="ja">` に変更する。** （現在 `"en"` になっている）

### ローディング状態
- [ ] 採点中・データ取得中などの重い処理に対して、適切なローディングUI（`loading.tsx` やスケルトンUI）が実装されていることを確認する。

---

## 6. デプロイ・CI/CD

### デプロイ前チェック
- [ ] `npm run build`（または `npx tsc --noEmit && next build`）がエラーなく完了することを確認する。
- [ ] `npx next lint` でESLintエラーがないことを確認する。
- [ ] E2Eテスト（`e2e/` ディレクトリ）を実行し、主要フローが正常に動作することを確認する。
- [ ] デプロイスクリプト（`deploy-web-PRODUCTION.sh`）の環境変数がすべて設定されていることを確認する。

### ロールバック
- [ ] Cloud Run のリビジョン管理を活用し、問題発生時にすぐ前バージョンへ切り戻せる手順を確認・文書化する。
- [ ] データベースマイグレーションのロールバック手順を確認する（破壊的マイグレーションに注意）。

---

## 7. 法的・コンプライアンス

### プライバシー・利用規約
- [ ] **プライバシーポリシーページ（`/privacy`）を作成する。** 個人情報（氏名、学習履歴、電話番号、メールアドレス等）の取り扱いを明示する。
- [ ] **利用規約ページ（`/terms`）を作成する。**
- [ ] 初回ログイン時やユーザー登録時に、利用規約・プライバシーポリシーへの同意を求めるフローを実装する。

### データ保持ポリシー
- [ ] **学習履歴・採点画像（Google Drive）・AIフィードバックなどのデータ保持期間ポリシーを策定する。** （参照: `docs/cto_architecture_review.md` §5.3）
- [ ] 退会・解約時のデータ削除フローを定義する。
