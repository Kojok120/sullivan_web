# デプロイ手順・ENV取得手順（Cloud Run + Supabase Realtime）

本ドキュメントは、Sullivanの本番運用に必要な**デプロイ手順**と**環境変数の取得方法**をまとめたものです。  
Cloud Runの公式ガイド（環境変数/シークレット/デプロイ）と、Supabase Realtimeの公式手順（Publication/購読）を前提に構成しています。

---

## 1. 前提（構成）
Cloud Runに以下の2サービスをデプロイします。

- **Webサービス**: UI/API・Drive Webhook・QStash発行
- **Grading Worker**: `/api/queue/grading` を受けて採点のみ実行

Webサービスは `GRADING_WORKER_URL` を使ってWorkerへジョブを送信します。

---

## 2. 環境変数の取得方法（どこから取るか）

### 2.1 Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

取得場所: Supabase Dashboard → Project Settings → API  
詳細: https://supabase.com/docs/guides/api/api-keys
注意:
- DEV/PRODUCTION で別プロジェクトを使う場合、`.env.DEV` / `.env.PRODUCTION` に正しいキーを入れる。

### 2.2 Supabase Realtime（Postgres Changes）
- **ENVではなくDB設定**です。
- 対象テーブルを `supabase_realtime` publication に追加する必要があります。  

公式ガイド:  
- https://supabase.com/docs/guides/realtime/postgres-changes  
- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes

### 2.3 PostgreSQL
取得元は使用DBにより異なります。

- `DATABASE_URL`: トランザクション用（SupabaseのTransaction Mode推奨）
- `DIRECT_URL`: マイグレーション用（SupabaseのSession Mode推奨）

### 2.4 Google Drive API（Cloud Run実行SA）
- `DRIVE_FOLDER_ID`（スキャン投入フォルダのID）
- Cloud Run本番は**キーなし運用**（実行SAでADC）
  - Driveの対象フォルダを `RUNTIME_SA_EMAIL` に共有
- ローカル開発のみ `GOOGLE_APPLICATION_CREDENTIALS=<json path>` を使う場合あり

### 2.5 Gemini API
- `GEMINI_API_KEY`
- `GEMINI_MODEL`（任意）

### 2.6 Upstash QStash
- `QSTASH_TOKEN`（WebとWorkerの両方で必要）
- `QSTASH_CURRENT_SIGNING_KEY`（Webhook受信側検証で使用）
- `QSTASH_NEXT_SIGNING_KEY`（Webhook受信側検証で使用）

取得場所: Upstash Console → QStash  
公式ドキュメント:  
https://upstash.com/docs/qstash/overall/getting-started  
https://upstash.com/docs/qstash/howto/signature

### 2.7 Upstash Redis（Drive Watch State）
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

取得場所: Upstash Console → Redis DB → REST API  
公式ドキュメント:  
https://upstash.com/docs/redis/features/restapi

### 2.8 アプリURL/内部シークレット
- `APP_URL`（WebサービスのURL）
- `GRADING_WORKER_URL`（WorkerのURL、**WebサービスとWorkerサービスの両方に設定**）
- `INTERNAL_API_SECRET`（内部API保護、Secret Managerに保存）
- `DRIVE_WEBHOOK_CHANNEL_ID`（任意: 固定channelIdにする場合）
- `DRIVE_WEBHOOK_TOKEN`（Webhook検証用トークン、Secret Managerに保存）

`GRADING_WORKER_URL` の取得例:
```bash
gcloud run services describe sullivan-grading-worker-production \
  --region asia-northeast1 \
  --project "<PROJECT_ID>" \
  --format="value(status.url)"
```
DEVは `sullivan-grading-worker-dev` に置き換える。

---

## 3. Cloud Runデプロイ手順

Cloud Run公式ガイド:
- デプロイ（ソースから）: https://docs.cloud.google.com/run/docs/deploying-source-code  
- 環境変数: https://docs.cloud.google.com/run/docs/configuring/services/environment-variables  
- シークレット: https://docs.cloud.google.com/run/docs/configuring/services/secrets

### 3.0 推奨実行順序（DEV/PRODUCTION共通）
1. DBマイグレーション & シード
2. Supabase Realtime 設定（publication + RLS）
3. Grading Worker を先にデプロイ
4. `GRADING_WORKER_URL` を取得して Web に設定
5. Web をデプロイ
6. Drive Webhook 登録（使う場合）

### 3.1 Webサービスのデプロイ
```bash
gcloud run deploy sullivan-web \
  --project "<PROJECT_ID>" \
  --service-account "<RUNTIME_SA_EMAIL>" \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "APP_URL=<WEB_URL>" \
  --set-env-vars "GRADING_WORKER_URL=<WORKER_URL>" \
  --set-env-vars "DATABASE_URL=<...>" \
  --set-env-vars "DIRECT_URL=<...>" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=<...>" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_ANON_KEY=<...>" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=<...>" \
  --set-env-vars "GEMINI_API_KEY=<...>" \
  --set-env-vars "GEMINI_MODEL=<optional>" \
  --set-env-vars "DRIVE_FOLDER_ID=<...>" \
  --set-env-vars "QSTASH_TOKEN=<...>" \
  --set-env-vars "QSTASH_CURRENT_SIGNING_KEY=<...>" \
  --set-env-vars "QSTASH_NEXT_SIGNING_KEY=<...>" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=<...>" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=<...>" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID=<optional>" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --update-secrets "DRIVE_WEBHOOK_TOKEN=drive-webhook-token:latest"
```

### 3.2 Grading Workerのデプロイ
```bash
gcloud builds submit \
  --project "<PROJECT_ID>" \
  --config cloudbuild.worker.yaml \
  --substitutions "_IMAGE_URI=asia.gcr.io/<PROJECT_ID>/sullivan-grading-worker-production:<TAG>" \
  .

gcloud run deploy sullivan-grading-worker-production \
  --project "<PROJECT_ID>" \
  --service-account "<RUNTIME_SA_EMAIL>" \
  --image "asia.gcr.io/<PROJECT_ID>/sullivan-grading-worker-production:<TAG>" \
  --region asia-northeast1 \
  --platform managed \
  --memory 4Gi \
  --cpu 2 \
  --concurrency 1 \
  --min-instances 10 \
  --max-instances 50 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,SERVICE_ROLE=worker" \
  --update-secrets "DATABASE_URL=database-url:latest" \
  --update-secrets "DIRECT_URL=direct-url:latest" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=<...>" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=<...>" \
  --set-env-vars "GEMINI_API_KEY=<...>" \
  --set-env-vars "GEMINI_MODEL=<optional>" \
  --set-env-vars "DRIVE_FOLDER_ID=<...>" \
  --set-env-vars "GRADING_WORKER_URL=<WORKER_URL>" \
  --set-env-vars "QSTASH_TOKEN=<...>" \
  --set-env-vars "QSTASH_CURRENT_SIGNING_KEY=<...>" \
  --set-env-vars "QSTASH_NEXT_SIGNING_KEY=<...>"
```

補足:
- WorkerはQStash署名検証（受信）と自己キュー投入（送信）を行うため、**`QSTASH_TOKEN` と署名鍵の両方が必須**です。
- Workerは Drive検知後に採点ジョブを自己キュー投入するため、`GRADING_WORKER_URL` が必須です。
- Workerは `Dockerfile.worker` からビルドされ、Next.jsを起動しません（採点専用プロセス）。
- 同時採点数は `concurrency(=1)` × `稼働インスタンス数` で決まるため、`min-instances` を授業時間に合わせて調整します。

### 3.3 Secret Manager（内部API/Drive Webhookトークン）
1. Secret Managerに `internal-api-secret` / `drive-webhook-token` を作成  
2. Cloud Run実行SAに `secretAccessor` を付与  

Cloud Runシークレット公式: https://docs.cloud.google.com/run/docs/configuring/services/secrets

具体手順（例）:
```bash
# 1) Secret を作成
printf %s "<INTERNAL_API_SECRET>" | gcloud secrets create internal-api-secret \
  --replication-policy="automatic" \
  --data-file=-

# 1b) Drive Webhook token を作成
printf %s "<DRIVE_WEBHOOK_TOKEN>" | gcloud secrets create drive-webhook-token \
  --replication-policy="automatic" \
  --data-file=-

# 2) Cloud Run実行SAにSecretアクセス権限を付与
gcloud secrets add-iam-policy-binding internal-api-secret \
  --member="serviceAccount:<RUNTIME_SA_EMAIL>" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding drive-webhook-token \
  --member="serviceAccount:<RUNTIME_SA_EMAIL>" \
  --role="roles/secretmanager.secretAccessor"
```

※ Drive APIを使うため、**対象のDriveフォルダをCloud Run実行SAに共有**する必要があります。

---

## 4. DBマイグレーション
Realtime用テーブル・GradingJob（冪等性）用テーブルが追加されているため、デプロイ後にマイグレーションが必要です。

```bash
npx prisma migrate deploy
npx prisma generate
```

### 4.1 DEV/PRODUCTION それぞれの実行例（.env.* を読み込む）
Prismaは `.env` 以外を自動読み込みしないため、実行前に読み込ませます。

```bash
# DEV
set -a; source .env.DEV; set +a
npx prisma migrate deploy
npx prisma db seed

# PRODUCTION
set -a; source .env.PRODUCTION; set +a
npx prisma migrate deploy
npx prisma db seed
```

### 4.2 マイグレーション再整備（新DB向け）
このリポジトリでは既存の履歴を `prisma/migrations_legacy_YYYYMMDD` に退避し、  
新しい初期マイグレーション `prisma/migrations/20260103000000_init` を用意しています。  

新しく作成したSupabase DBに対して、以下を実行してください。
```bash
npx prisma migrate deploy
npx prisma db seed
```

---

## 5. Supabase Realtimeの手動設定

### 5.1 Publication追加
Supabase Dashboard: Database → Replication → Publications → `supabase_realtime` → 対象テーブルをON  
または SQL Editorで以下を実行:

```sql
alter publication supabase_realtime add table realtime_events;
```

### 5.2 RLS有効化 + ポリシー
```sql
alter table realtime_events enable row level security;

create policy "Users can read own realtime events"
on realtime_events
for select
to authenticated
using ((auth.jwt()->'app_metadata'->>'prismaUserId') = user_id);
```

注意:
- `app_metadata.prismaUserId` が空のユーザーは通知を受信できません。  
  既存ユーザーがいる場合はバックフィルが必要です。

---

## 6. Drive Webhookのセットアップ
Webサービスがデプロイ済みであることが前提です。

```bash
curl -X POST <WEB_URL>/api/drive/watch/setup \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

継続運用では `/api/drive/watch/renew?check=1` を6時間ごとに定期実行します。  
`check=1` は Drive の取りこぼし対策として定期的に `checkDriveForNewFiles` を実行します。  
`DRIVE_WEBHOOK_TOKEN` を変更した場合は再度 `/api/drive/watch/setup` を実行してください。
Supabase Realtime は通知用途のみで、採点トリガーには使われません（Drive Webhook または **Workerサービスの** `/api/grading/check` が入口）。

---

## 7. 動作確認チェック
- QStashがWorkerへジョブを送れているか  
- `realtime_events` にINSERTされるか  
- Supabase Realtimeでクライアントに通知が届くか  
- Drive Webhookから採点が発火するか  

---

## 8. 参考リンク（Web Search）
- Cloud Run: デプロイ/環境変数/シークレット  
  https://docs.cloud.google.com/run/docs/deploying-source-code  
  https://docs.cloud.google.com/run/docs/configuring/services/environment-variables  
  https://docs.cloud.google.com/run/docs/configuring/services/secrets  
  https://docs.cloud.google.com/run/docs/securing/service-identity
- Supabase: API Keys / Realtime  
  https://supabase.com/docs/guides/api/api-keys  
  https://supabase.com/docs/guides/realtime/postgres-changes  
  https://supabase.com/docs/guides/realtime/subscribing-to-database-changes  
- Upstash: QStash / Redis REST  
  https://upstash.com/docs/qstash/overall/getting-started  
  https://upstash.com/docs/qstash/howto/signature  
  https://upstash.com/docs/redis/features/restapi  
補足:
- `deploy-web-PRODUCTION.sh` / `deploy-web-DEV.sh` がWebサービス用です。
- `deploy-grading-worker-PRODUCTION.sh` / `deploy-grading-worker-DEV.sh` がWorker用です。
