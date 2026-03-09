#!/bin/bash

set -euo pipefail

# Load .env.PRODUCTION variables for deployment
if [ -f .env.PRODUCTION ]; then
  export $(grep -v '^#' .env.PRODUCTION | xargs)
else
  echo ".env.PRODUCTION file not found!"
  exit 1
fi

require_env() {
  local name="$1"
  if [ -z "${!name}" ]; then
    echo "Missing required env: $name"
    exit 1
  fi
}

resolve_secret_value() {
  local env_name="$1"
  local secret_name="$2"
  if [ -n "${!env_name:-}" ]; then
    printf '%s' "${!env_name}"
    return 0
  fi

  gcloud secrets versions access latest \
    --secret="$secret_name" \
    --project "$GOOGLE_CLOUD_PROJECT_ID"
}

upsert_scheduler_job() {
  local job_name="$1"
  local schedule="$2"
  local uri="$3"
  local message_body="${4:-}"
  local header_arg="Authorization=Bearer $INTERNAL_API_SECRET_VALUE,Content-Type=application/json"

  if gcloud scheduler jobs describe "$job_name" --location "$SCHEDULER_LOCATION" --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null 2>&1; then
    local update_args=(
      scheduler jobs update http "$job_name"
      --location "$SCHEDULER_LOCATION"
      --project "$GOOGLE_CLOUD_PROJECT_ID"
      --schedule "$schedule"
      --time-zone "$SCHEDULER_TIME_ZONE"
      --uri "$uri"
      --http-method POST
      --update-headers "$header_arg"
    )

    if [ -n "$message_body" ]; then
      update_args+=(--message-body "$message_body")
    else
      update_args+=(--clear-message-body)
    fi

    gcloud "${update_args[@]}"
    return 0
  fi

  local create_args=(
    scheduler jobs create http "$job_name"
    --location "$SCHEDULER_LOCATION"
    --project "$GOOGLE_CLOUD_PROJECT_ID"
    --schedule "$schedule"
    --time-zone "$SCHEDULER_TIME_ZONE"
    --uri "$uri"
    --http-method POST
    --headers "$header_arg"
  )

  if [ -n "$message_body" ]; then
    create_args+=(--message-body "$message_body")
  fi

  gcloud "${create_args[@]}"
}

GOOGLE_CLOUD_PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID:-sullivan-production-483212}"
CLOUD_RUN_REGION="asia-northeast1"
SCHEDULER_LOCATION="asia-northeast1"
SCHEDULER_TIME_ZONE="Asia/Tokyo"
SERVICE_NAME="sullivan-app-production"
WARM_START_JOB_NAME="sullivan-app-warm-start"
WARM_STOP_JOB_NAME="sullivan-app-warm-stop"
DRIVE_RENEW_JOB_NAME="sullivan-drive-watch-renew"

require_env "NEXT_PUBLIC_SUPABASE_URL"
require_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
require_env "SUPABASE_SERVICE_ROLE_KEY"
require_env "GEMINI_API_KEY"
require_env "GRADING_WORKER_URL"
require_env "QSTASH_TOKEN"
require_env "QSTASH_CURRENT_SIGNING_KEY"
require_env "QSTASH_NEXT_SIGNING_KEY"

GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_MODEL="${GEMINI_CHAT_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_FALLBACK_MODEL="${GEMINI_CHAT_FALLBACK_MODEL:-$GEMINI_CHAT_MODEL}"
INTERNAL_API_SECRET_VALUE="$(resolve_secret_value "INTERNAL_API_SECRET" "internal-api-secret")"

cat > .env.build <<EOF
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=${NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS:-500}
EOF

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"

echo "Deploying to Project: $GOOGLE_CLOUD_PROJECT_ID"

# Deploy Command
gcloud run deploy "$SERVICE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --service-account "$RUNTIME_SA_EMAIL" \
  --source . \
  --platform managed \
  --region "$CLOUD_RUN_REGION" \
  --memory 4Gi \
  --cpu 2 \
  --min 0 \
  --concurrency 4 \
  --timeout 120s \
  --allow-unauthenticated \
  --set-env-vars "BIND_HOST=0.0.0.0" \
  --set-build-env-vars "NODE_ENV=production" \
  --set-env-vars "NODE_ENV=production,SERVICE_ROLE=web" \
  --update-secrets "DATABASE_URL=database-url:latest" \
  --update-secrets "DIRECT_URL=direct-url:latest" \
  --set-env-vars "QSTASH_TOKEN=$QSTASH_TOKEN" \
  --set-env-vars "QSTASH_CURRENT_SIGNING_KEY=$QSTASH_CURRENT_SIGNING_KEY" \
  --set-env-vars "QSTASH_NEXT_SIGNING_KEY=$QSTASH_NEXT_SIGNING_KEY" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN" \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set-env-vars "GEMINI_MODEL=$GEMINI_MODEL" \
  --set-env-vars "GEMINI_CHAT_MODEL=$GEMINI_CHAT_MODEL" \
  --set-env-vars "GEMINI_CHAT_FALLBACK_MODEL=$GEMINI_CHAT_FALLBACK_MODEL" \
  --set-env-vars "GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL:-gemini-2.5-flash-native-audio-preview-09-2025}" \
  --set-env-vars "GEMINI_LIVE_API_VERSION=${GEMINI_LIVE_API_VERSION:-v1beta}" \
  --set-env-vars "GEMINI_LIVE_VOICE=${GEMINI_LIVE_VOICE:-Aoede}" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "APP_URL=$APP_URL" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT_ID=$GOOGLE_CLOUD_PROJECT_ID" \
  --set-env-vars "CLOUD_RUN_REGION=$CLOUD_RUN_REGION" \
  --set-build-env-vars "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
  --set-build-env-vars "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --set-build-env-vars "NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=${NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS:-500}" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --set-env-vars "NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=${NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS:-500}" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --update-secrets "DRIVE_WEBHOOK_TOKEN=drive-webhook-token:latest" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID=$DRIVE_WEBHOOK_CHANNEL_ID" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID_FIXED=${DRIVE_WEBHOOK_CHANNEL_ID_FIXED:-false}" \
  --set-env-vars "DRIVE_WATCH_RENEW_THRESHOLD_HOURS=${DRIVE_WATCH_RENEW_THRESHOLD_HOURS:-18}" \
  --set-env-vars "DRIVE_WATCH_STATE_KEY=${DRIVE_WATCH_STATE_KEY}" \
  --set-env-vars "GRADING_WORKER_URL=$GRADING_WORKER_URL"

# Cloud Run から自分自身の min instances を更新できるようにする。
# service を更新するときは、設定済み service account への actAs も必要。
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --member "serviceAccount:$RUNTIME_SA_EMAIL" \
  --role "roles/iam.serviceAccountUser" \
  --quiet >/dev/null

gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --region "$CLOUD_RUN_REGION" \
  --member "serviceAccount:$RUNTIME_SA_EMAIL" \
  --role "roles/run.admin" \
  --quiet >/dev/null

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --region "$CLOUD_RUN_REGION" \
  --format='value(status.url)')"

if [ -z "$SERVICE_URL" ]; then
  echo "Failed to resolve Cloud Run service URL"
  exit 1
fi

SCALING_API_URL="$SERVICE_URL/api/internal/cloud-run/min-instances"
DRIVE_RENEW_URL="$SERVICE_URL/api/drive/watch/renew?check=1"

upsert_scheduler_job \
  "$WARM_START_JOB_NAME" \
  "0 15 * * 1-5" \
  "$SCALING_API_URL" \
  '{"minInstances":1,"reason":"weekday-warm-start"}'

upsert_scheduler_job \
  "$WARM_STOP_JOB_NAME" \
  "0 22 * * 1-5" \
  "$SCALING_API_URL" \
  '{"minInstances":0,"reason":"weekday-warm-stop"}'

upsert_scheduler_job \
  "$DRIVE_RENEW_JOB_NAME" \
  "30 15,21 * * 1-5" \
  "$DRIVE_RENEW_URL"

# warm 制御 API が deploy 直後に機能することを確認する。
curl --fail --silent --show-error \
  -X POST "$SCALING_API_URL" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET_VALUE" \
  -H "Content-Type: application/json" \
  -d '{"minInstances":0,"reason":"weekday-warm-stop"}' >/dev/null
