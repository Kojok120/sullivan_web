# デプロイ手順・ENV取得手順（Cloud Run + Supabase Realtime）

本ドキュメントは、Sullivanの本番運用に必要な**デプロイ手順**と**環境変数の取得方法**をまとめたものです。  
Cloud Runの公式ガイド（環境変数/シークレット/デプロイ）と、Supabase Realtimeの公式手順（Publication/購読）を前提に構成しています。

---

## 1. 前提（構成）
Cloud Runに以下の2サービスをデプロイします。

- **Webサービス**: UI/API・Drive Webhook・Cloud Tasks発行
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
- `GEMINI_CHAT_MODEL`（任意）
- `GEMINI_CHAT_FALLBACK_MODEL`（任意）

### 2.6 Google Cloud Tasks

- `GOOGLE_CLOUD_PROJECT_ID`
- `CLOUD_TASKS_LOCATION`（既定 `asia-northeast1`）
- `GRADING_TASK_QUEUE`（既定 `sullivan-grading`）
- `DRIVE_CHECK_TASK_QUEUE`（既定 `sullivan-drive-check`）
- `CLOUD_TASKS_CALLER_SERVICE_ACCOUNT`（既定 `RUNTIME_SA_EMAIL`）

取得場所: Google Cloud Console / `gcloud`
補足:
- queue は Worker と同一 region に作成する。
- `CLOUD_TASKS_CALLER_SERVICE_ACCOUNT` は Cloud Tasks が OIDC token 発行時に impersonate する service account。

### 2.7 アプリURL/内部シークレット

- `APP_URL`（WebサービスのURL）
- `GRADING_WORKER_URL`（WorkerのURL、**WebサービスとWorkerサービスの両方に設定**）
- `INTERNAL_API_SECRET`（内部API保護、Secret Managerに保存）
- `DRIVE_WEBHOOK_CHANNEL_ID`（任意: channelId prefix。既定ではランダムsuffixが付与される）
- `DRIVE_WEBHOOK_CHANNEL_ID_FIXED`（任意: `true` の場合のみ固定channelId運用）
- `DRIVE_WEBHOOK_TOKEN`（Webhook検証用トークン、Secret Managerに保存）
- `DRIVE_WATCH_STATE_KEY`（任意: DB上のWatch状態キー。環境ごとに分離推奨）
- `DRIVE_WATCH_RENEW_THRESHOLD_HOURS`（任意: renew開始閾値。既定18時間）

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
  --set-env-vars "GEMINI_CHAT_MODEL=<optional>" \
  --set-env-vars "GEMINI_CHAT_FALLBACK_MODEL=<optional>" \
  --set-env-vars "DRIVE_FOLDER_ID=<...>" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT_ID=<PROJECT_ID>" \
  --set-env-vars "CLOUD_TASKS_LOCATION=asia-northeast1" \
  --set-env-vars "GRADING_TASK_QUEUE=sullivan-grading" \
  --set-env-vars "DRIVE_CHECK_TASK_QUEUE=sullivan-drive-check" \
  --set-env-vars "CLOUD_TASKS_CALLER_SERVICE_ACCOUNT=<RUNTIME_SA_EMAIL>" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID=<optional>" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID_FIXED=false" \
  --set-env-vars "DRIVE_WATCH_RENEW_THRESHOLD_HOURS=18" \
  --set-env-vars "DRIVE_WATCH_STATE_KEY=sullivan:drive:watch:state:<env>" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --update-secrets "DRIVE_WEBHOOK_TOKEN=drive-webhook-token:latest"
```

### 3.2 Grading Workerのデプロイ

```bash
gcloud builds submit \
  --project "<PROJECT_ID>" \
  --region asia-northeast1 \
  --config cloudbuild.worker.yaml \
  --substitutions "_IMAGE_URI=asia.gcr.io/<PROJECT_ID>/sullivan-grading-worker-production:<TAG>,_BASE_IMAGE_URI=asia.gcr.io/<PROJECT_ID>/sullivan-grading-worker-base:<BASE_TAG>" \
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
  --min-instances 0 \
  --max-instances 50 \
  --no-allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,SERVICE_ROLE=worker" \
  --update-secrets "DATABASE_URL=database-url:latest" \
  --update-secrets "DIRECT_URL=direct-url:latest" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --set-env-vars "GEMINI_API_KEY=<...>" \
  --set-env-vars "GEMINI_MODEL=<optional>" \
  --set-env-vars "GEMINI_CHAT_MODEL=<optional>" \
  --set-env-vars "GEMINI_CHAT_FALLBACK_MODEL=<optional>" \
  --set-env-vars "DRIVE_FOLDER_ID=<...>" \
  --set-env-vars "GRADING_WORKER_URL=<WORKER_URL>" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT_ID=<PROJECT_ID>" \
  --set-env-vars "CLOUD_RUN_REGION=asia-northeast1" \
  --set-env-vars "CLOUD_TASKS_LOCATION=asia-northeast1" \
  --set-env-vars "GRADING_TASK_QUEUE=sullivan-grading" \
  --set-env-vars "DRIVE_CHECK_TASK_QUEUE=sullivan-drive-check" \
  --set-env-vars "CLOUD_TASKS_CALLER_SERVICE_ACCOUNT=<RUNTIME_SA_EMAIL>"
```

補足:
- Worker は Cloud Run IAM で保護された private service としてデプロイし、Cloud Tasks の OIDC 付き push のみを受け付けます。
- Workerは Drive検知後に採点ジョブを自己キュー投入するため、`GRADING_WORKER_URL` が必須です。
- Workerは `Dockerfile.worker` からビルドされ、Next.jsを起動しません（採点専用プロセス）。
- 同時採点数は `concurrency(=1)` × `稼働インスタンス数` で決まるため、`min-instances` を授業時間に合わせて調整します。
- `deploy-grading-worker-*.sh` は Cloud Scheduler job を作成し、平日 `15:00` に `min-instances=1`、`22:00` に `min-instances=0` へ戻します。
- Worker は private service のため、Scheduler は OIDC 付きで `/api/internal/cloud-run/min-instances` を呼びます。

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

推奨設定（再発防止）:
- Scheduler間隔は1時間（`0 * * * *`）
- retryを有効化（例: `--max-retry-attempts=5 --min-backoff=30s --max-backoff=600s`）
- `DRIVE_WATCH_RENEW_THRESHOLD_HOURS=18` を維持（6時間間隔運用でも猶予を確保）

更新例:
```bash
gcloud scheduler jobs update http sullivan-drive-watch-renew \
  --project "<PROJECT_ID>" \
  --location asia-northeast1 \
  --schedule "0 * * * *" \
  --time-zone "Asia/Tokyo" \
  --max-retry-attempts 5 \
  --min-backoff 30s \
  --max-backoff 600s
```

---

## 7. 動作確認チェック
- Cloud Tasks が Worker へジョブを送れているか
- `realtime_events` にINSERTされるか  
- Supabase Realtimeでクライアントに通知が届くか  
- Drive Webhookから採点が発火するか  

---

## 8. Production監視通知（Pub/Sub + Cloud Run function）

production のデプロイ通知と、Cloud Run エラー通知は保存先を分けます。

- GitHub Actions のデプロイ通知:
  - GitHub `production` environment secret の `DISCORD_WEBHOOK_URL`
  - GitHub `production` environment secret の `DISCORD_ERROR_MENTION`（任意）
- GCP Monitoring のアラート通知:
  - Secret Manager の `discord-alert-webhook-url-production`
  - Cloud Run function の環境変数 `DISCORD_ALERT_WEBHOOK_URL` に注入
  - Cloud Run function の環境変数 `DISCORD_ERROR_MENTION`（任意）

### 8.1 repo 側の実装内容
- `ops/discord-alert-relay/`
  - Pub/Sub 経由の Monitoring incident を受けて Discord に転送する Cloud Run function
- `.github/workflows/deploy-discord-alert-relay-production.yml`
  - `main` への push か手動実行で relay をデプロイ
- `tests/discord-alert-relay.test.ts`
  - payload デコードと Discord メッセージ整形のテスト
  - OPEN アラートのみメンションし、CLOSED ではメンションしないことを検証

Cloud Run function の固定値:
- service 名: `discord-alert-relay-production`
- entrypoint: `monitoringAlertToDiscord`
- base image: `nodejs20`
- runtime service account 名: `discord-alert-relay-sa`
- Eventarc trigger service account 名: `eventarc-discord-relay-sa`
- Pub/Sub topic 名: `monitoring-alerts-production`
- notification channel 表示名: `Production Alerts PubSub`

メンション仕様:
- `DISCORD_ERROR_MENTION` が未設定の場合は、常に通常通知のみ
- production デプロイ通知は `失敗` のときだけメンション
- Cloud Monitoring アラートは `OPEN` のときだけメンション
- `CLOSED` の復旧通知ではメンションしない
- 値は Discord の生の mention 文字列を入れる
  - 例: `<@&123456789012345678>`（ロール）
  - 例: `<@123456789012345678>`（ユーザー）

### 8.2 GCP の one-time setup
以下は手動設定です。

```bash
export PROJECT_ID="<GCP_PROJECT_ID>"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REGION="asia-northeast1"

export ALERT_TOPIC="monitoring-alerts-production"
export RELAY_SERVICE="discord-alert-relay-production"
export RELAY_RUNTIME_SA="discord-alert-relay-sa"
export RELAY_TRIGGER_SA="eventarc-discord-relay-sa"
export ALERT_SECRET="discord-alert-webhook-url-production"

export WIF_DEPLOYER_SA="<GitHub Actionsで使っているWIF_SERVICE_ACCOUNTのメールアドレス>"
```

1. Discord にアラート専用チャンネルを作成し、webhook URL を発行する
1. GitHub `production` environment secret に必要なら `DISCORD_ERROR_MENTION` を追加する
   - デプロイ失敗通知と Cloud Run アラートの両方で同じ mention 先を使う
   - 例: `<@&123456789012345678>`
2. 必要 API を有効化する

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID"
```

3. Pub/Sub topic を作成する

```bash
gcloud pubsub topics create "$ALERT_TOPIC" --project "$PROJECT_ID"
```

4. Discord webhook URL を Secret Manager に保存する

```bash
printf '%s' 'https://discord.com/api/webhooks/...' | \
gcloud secrets create "$ALERT_SECRET" \
  --replication-policy="automatic" \
  --data-file=- \
  --project "$PROJECT_ID"
```

既に secret がある場合は、次で version を追加します。

```bash
printf '%s' 'https://discord.com/api/webhooks/...' | \
gcloud secrets versions add "$ALERT_SECRET" \
  --data-file=- \
  --project "$PROJECT_ID"
```

5. runtime service account を作成し、secret 読み取り権限を付与する

```bash
gcloud iam service-accounts create "$RELAY_RUNTIME_SA" --project "$PROJECT_ID"

gcloud secrets add-iam-policy-binding "$ALERT_SECRET" \
  --member="serviceAccount:${RELAY_RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project "$PROJECT_ID"
```

6. GitHub Actions の deployer に runtime service account の指定権限を付与する

```bash
gcloud iam service-accounts add-iam-policy-binding \
  "${RELAY_RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:${WIF_DEPLOYER_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project "$PROJECT_ID"
```

7. Eventarc trigger 用 service account を作成し、Eventarc 受信権限を付与する

```bash
gcloud iam service-accounts create "$RELAY_TRIGGER_SA" --project "$PROJECT_ID"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RELAY_TRIGGER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver"
```

8. repo 側の変更を `main` に入れたあと、GitHub Actions の `Deploy Discord Alert Relay (PRODUCTION)` を 1 回実行して relay をデプロイする
   - `DISCORD_ERROR_MENTION` を新規追加した場合も、この workflow を再実行して Cloud Run service に反映する

9. relay への invoke 権限を Eventarc trigger service account に付与する

```bash
gcloud run services add-iam-policy-binding "$RELAY_SERVICE" \
  --region "$REGION" \
  --member="serviceAccount:${RELAY_TRIGGER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project "$PROJECT_ID"
```

10. Eventarc trigger を作成する

```bash
gcloud eventarc triggers create discord-alert-relay-production \
  --location="$REGION" \
  --destination-run-service="$RELAY_SERVICE" \
  --destination-run-region="$REGION" \
  --event-filters="type=google.cloud.pubsub.topic.v1.messagePublished" \
  --transport-topic="projects/${PROJECT_ID}/topics/${ALERT_TOPIC}" \
  --service-account="${RELAY_TRIGGER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project "$PROJECT_ID"
```

11. Monitoring の Pub/Sub notification channel を作成する
- Console で `Monitoring > Alerting > Edit notification channels > Pub/Sub > Add new`
- Topic に `projects/<PROJECT_ID>/topics/monitoring-alerts-production` を指定
- 表示名は `Production Alerts PubSub`

12. Monitoring notification service account に `Pub/Sub Publisher` を付与する

```bash
gcloud pubsub topics add-iam-policy-binding "$ALERT_TOPIC" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-monitoring-notification.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project "$PROJECT_ID"
```

13. Logs Explorer から log-based alert policy を 2 本作成する
- alert policy 名: `Sullivan Web Production Error Logs`
  - `resource.type="cloud_run_revision"`
  - `resource.labels.service_name="sullivan-app-production"`
  - `severity>=ERROR`
- alert policy 名: `Sullivan Worker Production Error Logs`
  - `resource.type="cloud_run_revision"`
  - `resource.labels.service_name="sullivan-grading-worker-production"`
  - `severity>=ERROR`
- 共通設定:
  - Notification channel は `Production Alerts PubSub`
  - `Minimum time between notifications` は `5 minutes`
  - 通知文書には Cloud Run Logs へのリンクと一次切り分けメモを入れる

### 8.3 動作確認
relay 単体の疎通確認:

```bash
TEST_PAYLOAD='{"version":"1.2","incident":{"state":"open","policy_name":"manual test","summary":"manual Pub/Sub test","url":"https://console.cloud.google.com/","resource":{"labels":{"service_name":"sullivan-app-production"}}}}'

gcloud pubsub topics publish "$ALERT_TOPIC" \
  --message="$TEST_PAYLOAD" \
  --project "$PROJECT_ID"
```

期待結果:
- Discord のアラート用チャンネルに 1 件届く
- Cloud Run `discord-alert-relay-production` のログにエラーが出ない

relay のローカルテスト:

```bash
npx vitest run tests/discord-alert-relay.test.ts
```

### 8.4 トラブルシュート
- GitHub Actions の deploy が失敗する
  - `discord-alert-relay-sa@<PROJECT_ID>.iam.gserviceaccount.com` が未作成か、`roles/iam.serviceAccountUser` が WIF deployer に付与されていない可能性があります
- Eventarc trigger は作れたが Discord に届かない
  - `roles/run.invoker` が `eventarc-discord-relay-sa` に付与されているか確認します
  - trigger 作成直後は伝播まで数分かかることがあります
- Alert policy は発火しているのに relay が呼ばれない
  - `service-${PROJECT_NUMBER}@gcp-sa-monitoring-notification.iam.gserviceaccount.com` に `roles/pubsub.publisher` が topic 単位で付いているか確認します
- relay が Discord へ投げるところで失敗する
  - Secret Manager の `discord-alert-webhook-url-production` の値を確認します
  - Discord 側で webhook が削除・再生成されていないか確認します
- メンションされない
  - GitHub `production` environment secret の `DISCORD_ERROR_MENTION` が設定されているか確認します
  - relay は workflow 再実行後の設定値しか反映されないため、`Deploy Discord Alert Relay (PRODUCTION)` を再実行します
  - Discord の値は `<@&ROLE_ID>` または `<@USER_ID>` の生文字列である必要があります

## 9. 参考リンク（Web Search）
- Cloud Run: デプロイ/環境変数/シークレット  
  https://docs.cloud.google.com/run/docs/deploying-source-code  
  https://docs.cloud.google.com/run/docs/configuring/services/environment-variables  
  https://docs.cloud.google.com/run/docs/configuring/services/secrets  
  https://docs.cloud.google.com/run/docs/securing/service-identity
- Supabase: API Keys / Realtime  
  https://supabase.com/docs/guides/api/api-keys  
  https://supabase.com/docs/guides/realtime/postgres-changes  
  https://supabase.com/docs/guides/realtime/subscribing-to-database-changes  
- Google Cloud Tasks
  https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks
  https://docs.cloud.google.com/tasks/docs/creating-queues
補足:
- `deploy-web-PRODUCTION.sh` / `deploy-web-DEV.sh` がWebサービス用です。
- `deploy-grading-worker-PRODUCTION.sh` / `deploy-grading-worker-DEV.sh` がWorker用です。
