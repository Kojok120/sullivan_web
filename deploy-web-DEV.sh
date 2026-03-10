#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env.DEV variables for deployment
if [ -f .env.DEV ]; then
  export $(grep -v '^#' .env.DEV | xargs)
else
  echo ".env.DEV file not found!"
  exit 1
fi

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env: $name"
    exit 1
  fi
}

ensure_gcp_service_enabled() {
  local service_name="$1"
  gcloud services enable "$service_name" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null
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

require_env "GOOGLE_CLOUD_PROJECT_ID"
require_env "NEXT_PUBLIC_SUPABASE_URL"
require_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
require_env "SUPABASE_SERVICE_ROLE_KEY"
require_env "GEMINI_API_KEY"
require_env "GRADING_WORKER_URL"

SKIP_INFRA_SETUP="${SKIP_INFRA_SETUP:-0}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_MODEL="${GEMINI_CHAT_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_FALLBACK_MODEL="${GEMINI_CHAT_FALLBACK_MODEL:-$GEMINI_CHAT_MODEL}"
CLOUD_TASKS_LOCATION="${CLOUD_TASKS_LOCATION:-asia-northeast1}"
CLOUD_RUN_REGION="${CLOUD_RUN_REGION:-asia-northeast1}"
CLOUD_BUILD_REGION="${CLOUD_BUILD_REGION:-asia-northeast1}"
GRADING_TASK_QUEUE="${GRADING_TASK_QUEUE:-sullivan-grading}"
DRIVE_CHECK_TASK_QUEUE="${DRIVE_CHECK_TASK_QUEUE:-sullivan-drive-check}"
SERVICE_NAME="sullivan-app-dev"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_URI="${IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-app-dev:${IMAGE_TAG}}"
WEB_BASE_IMAGE_TAG="${WEB_BASE_IMAGE_TAG:-$(compute_file_hash Dockerfile.web-base)}"
WEB_BASE_IMAGE_URI="${WEB_BASE_IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-web-base:${WEB_BASE_IMAGE_TAG}}"

if [ "$CLOUD_BUILD_REGION" = "global" ]; then
  CLOUD_BUILD_REGION="asia-northeast1"
fi

cat > .env.build <<EOF
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=${NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS:-500}
EOF

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"
CLOUD_TASKS_CALLER_SERVICE_ACCOUNT="${CLOUD_TASKS_CALLER_SERVICE_ACCOUNT:-$RUNTIME_SA_EMAIL}"

echo "Deploying to Project: $GOOGLE_CLOUD_PROJECT_ID"
echo "Building web image: $IMAGE_URI"
echo "Using web base image: $WEB_BASE_IMAGE_URI"
echo "Cloud Build region: $CLOUD_BUILD_REGION"

if [ "$SKIP_INFRA_SETUP" != "1" ]; then
  ensure_gcp_service_enabled "cloudtasks.googleapis.com"
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
  --port 8080 \
  --memory 4Gi \
  --cpu 2 \
  --concurrency 4 \
  --timeout 120s \
  --quiet \
  --allow-unauthenticated \
  --set-env-vars "BIND_HOST=0.0.0.0,SERVICE_ROLE=web" \
  --set-env-vars "NODE_ENV=production" \
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
fi
