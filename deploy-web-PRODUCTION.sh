#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env.PRODUCTION variables for deployment
if [ -f .env.PRODUCTION ]; then
  export $(grep -v '^#' .env.PRODUCTION | xargs)
else
  echo ".env.PRODUCTION file not found!"
  exit 1
fi

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
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

ensure_gcp_service_enabled() {
  local service_name="$1"
  gcloud services enable "$service_name" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null
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

compute_file_hash() {
  local file_path="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print substr($1, 1, 16)}'
    return 0
  fi

  shasum -a 256 "$file_path" | awk '{print substr($1, 1, 16)}'
}

image_exists() {
  local image_uri="$1"
  gcloud container images describe "$image_uri" >/dev/null 2>&1
}

run_cloud_build() {
  local config_path="$1"
  local substitutions="${2:-}"

  local args=(
    builds submit
    --project "$GOOGLE_CLOUD_PROJECT_ID"
    --region "$CLOUD_BUILD_REGION"
    --config "$config_path"
    --quiet
    --suppress-logs
  )

  if [ -n "$substitutions" ]; then
    args+=(--substitutions "$substitutions")
  fi

  args+=(.)

  gcloud "${args[@]}"
}

ensure_base_image() {
  local image_uri="$1"
  local config_path="$2"

  if [ "${FORCE_BASE_IMAGE_REBUILD:-0}" = "1" ] || ! image_exists "$image_uri"; then
    echo "Building base image: $image_uri"
    run_cloud_build "$config_path" "_IMAGE_URI=$image_uri"
    return 0
  fi

  echo "Reusing base image: $image_uri"
}

GOOGLE_CLOUD_PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID:-sullivan-production-483212}"
CLOUD_RUN_REGION="${CLOUD_RUN_REGION:-asia-northeast1}"
CLOUD_BUILD_REGION="${CLOUD_BUILD_REGION:-asia-northeast1}"
CLOUD_TASKS_LOCATION="${CLOUD_TASKS_LOCATION:-asia-northeast1}"
SCHEDULER_LOCATION="asia-northeast1"
SCHEDULER_TIME_ZONE="Asia/Tokyo"
SKIP_INFRA_SETUP="${SKIP_INFRA_SETUP:-0}"
SERVICE_NAME="sullivan-app-production"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_URI="${IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-app-production:${IMAGE_TAG}}"
WEB_BASE_IMAGE_TAG="${WEB_BASE_IMAGE_TAG:-$(compute_file_hash Dockerfile.web-base)}"
WEB_BASE_IMAGE_URI="${WEB_BASE_IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-web-base:${WEB_BASE_IMAGE_TAG}}"
WARM_START_JOB_NAME="sullivan-app-warm-start"
WARM_STOP_JOB_NAME="sullivan-app-warm-stop"
DRIVE_RENEW_JOB_NAME="sullivan-drive-watch-renew"
GRADING_TASK_QUEUE="${GRADING_TASK_QUEUE:-sullivan-grading}"
DRIVE_CHECK_TASK_QUEUE="${DRIVE_CHECK_TASK_QUEUE:-sullivan-drive-check}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_MODEL="${GEMINI_CHAT_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_FALLBACK_MODEL="${GEMINI_CHAT_FALLBACK_MODEL:-$GEMINI_CHAT_MODEL}"
RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"
CLOUD_TASKS_CALLER_SERVICE_ACCOUNT="${CLOUD_TASKS_CALLER_SERVICE_ACCOUNT:-$RUNTIME_SA_EMAIL}"
INTERNAL_API_SECRET_VALUE="$(resolve_secret_value "INTERNAL_API_SECRET" "internal-api-secret")"

if [ "$CLOUD_BUILD_REGION" = "global" ]; then
  CLOUD_BUILD_REGION="asia-northeast1"
fi

require_env "GOOGLE_CLOUD_PROJECT_ID"
require_env "NEXT_PUBLIC_SUPABASE_URL"
require_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
require_env "SUPABASE_SERVICE_ROLE_KEY"
require_env "GEMINI_API_KEY"
require_env "GRADING_WORKER_URL"

cat > .env.build <<EOF
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=${NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS:-500}
EOF

echo "Deploying to Project: $GOOGLE_CLOUD_PROJECT_ID"
echo "Building web image: $IMAGE_URI"
echo "Using web base image: $WEB_BASE_IMAGE_URI"
echo "Cloud Build region: $CLOUD_BUILD_REGION"

if [ "$SKIP_INFRA_SETUP" != "1" ]; then
  ensure_gcp_service_enabled "cloudtasks.googleapis.com"
  upsert_task_queue() {
    local queue_name="$1"

    local queue_args=(
      --location "$CLOUD_TASKS_LOCATION"
      --project "$GOOGLE_CLOUD_PROJECT_ID"
      --max-attempts 4
      --max-retry-duration 0s
      --min-backoff 5s
      --max-backoff 300s
      --max-doublings 4
    )

    if gcloud tasks queues describe "$queue_name" --location "$CLOUD_TASKS_LOCATION" --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null 2>&1; then
      gcloud tasks queues update "$queue_name" "${queue_args[@]}" >/dev/null
      return 0
    fi

    gcloud tasks queues create "$queue_name" "${queue_args[@]}" >/dev/null
  }

  upsert_task_queue "$GRADING_TASK_QUEUE"
  upsert_task_queue "$DRIVE_CHECK_TASK_QUEUE"
fi

ensure_base_image "$WEB_BASE_IMAGE_URI" "cloudbuild.web-base.yaml"

WEB_BUILD_SUBSTITUTIONS=$(
  printf '_IMAGE_URI=%s,_BASE_IMAGE_URI=%s,_NEXT_PUBLIC_SUPABASE_URL=%s,_NEXT_PUBLIC_SUPABASE_ANON_KEY=%s,_NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=%s' \
    "$IMAGE_URI" \
    "$WEB_BASE_IMAGE_URI" \
    "$NEXT_PUBLIC_SUPABASE_URL" \
    "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    "${NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS:-500}"
)

run_cloud_build "cloudbuild.web.yaml" "$WEB_BUILD_SUBSTITUTIONS"

gcloud run deploy "$SERVICE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --service-account "$RUNTIME_SA_EMAIL" \
  --image "$IMAGE_URI" \
  --platform managed \
  --region "$CLOUD_RUN_REGION" \
  --memory 4Gi \
  --cpu 2 \
  --min 0 \
  --concurrency 4 \
  --timeout 120s \
  --quiet \
  --allow-unauthenticated \
  --set-env-vars "BIND_HOST=0.0.0.0" \
  --set-env-vars "NODE_ENV=production,SERVICE_ROLE=web" \
  --update-secrets "DATABASE_URL=database-url:latest" \
  --update-secrets "DIRECT_URL=direct-url:latest" \
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
  --set-env-vars "CLOUD_TASKS_LOCATION=$CLOUD_TASKS_LOCATION" \
  --set-env-vars "GRADING_TASK_QUEUE=$GRADING_TASK_QUEUE" \
  --set-env-vars "DRIVE_CHECK_TASK_QUEUE=$DRIVE_CHECK_TASK_QUEUE" \
  --set-env-vars "CLOUD_TASKS_CALLER_SERVICE_ACCOUNT=$CLOUD_TASKS_CALLER_SERVICE_ACCOUNT" \
  --set-env-vars "RUNTIME_SA_EMAIL=$RUNTIME_SA_EMAIL" \
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

gcloud run services update-traffic "$SERVICE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --region "$CLOUD_RUN_REGION" \
  --to-latest >/dev/null

if [ "$SKIP_INFRA_SETUP" != "1" ]; then
  PROJECT_NUMBER="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT_ID" --format='value(projectNumber)')"
  CLOUD_TASKS_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"

  gcloud iam service-accounts add-iam-policy-binding "$CLOUD_TASKS_CALLER_SERVICE_ACCOUNT" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --member "serviceAccount:$CLOUD_TASKS_SERVICE_AGENT" \
    --role "roles/iam.serviceAccountUser" \
    --quiet >/dev/null

  gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT_ID" \
    --member "serviceAccount:$RUNTIME_SA_EMAIL" \
    --role "roles/cloudtasks.enqueuer" \
    --quiet >/dev/null

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
fi
