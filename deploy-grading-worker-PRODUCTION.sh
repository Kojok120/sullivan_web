#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
source "$SCRIPT_DIR/scripts/deploy-common.sh"

# Load production env vars
if [ -f .env.PRODUCTION ]; then
  export $(grep -v '^#' .env.PRODUCTION | xargs)
else
  echo ".env.PRODUCTION file not found!"
  exit 1
fi

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
  local header_arg="X-Internal-Api-Secret=$INTERNAL_API_SECRET_VALUE,Content-Type=application/json"

  if gcloud scheduler jobs describe "$job_name" --location "$SCHEDULER_LOCATION" --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null 2>&1; then
    local update_args=(
      scheduler jobs update http "$job_name"
      --location "$SCHEDULER_LOCATION"
      --project "$GOOGLE_CLOUD_PROJECT_ID"
      --schedule "$schedule"
      --time-zone "$SCHEDULER_TIME_ZONE"
      --uri "$uri"
      --http-method POST
      --oidc-service-account-email "$WORKER_SCHEDULER_CALLER_SERVICE_ACCOUNT"
      --oidc-token-audience "$WORKER_SERVICE_URL"
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
    --oidc-service-account-email "$WORKER_SCHEDULER_CALLER_SERVICE_ACCOUNT"
    --oidc-token-audience "$WORKER_SERVICE_URL"
    --headers "$header_arg"
  )

  if [ -n "$message_body" ]; then
    create_args+=(--message-body "$message_body")
  fi

  gcloud "${create_args[@]}"
}

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_URI="${IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-grading-worker-production:${IMAGE_TAG}}"
WORKER_BASE_IMAGE_TAG="${WORKER_BASE_IMAGE_TAG:-$(compute_file_hash Dockerfile.worker-base cloudbuild.worker-base.yaml)}"
WORKER_BASE_IMAGE_URI="${WORKER_BASE_IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-grading-worker-base:${WORKER_BASE_IMAGE_TAG}}"
SERVICE_NAME="sullivan-grading-worker-production"
SCHEDULER_LOCATION="${SCHEDULER_LOCATION:-asia-northeast1}"
SCHEDULER_TIME_ZONE="${SCHEDULER_TIME_ZONE:-Asia/Tokyo}"
WARM_START_JOB_NAME="${WARM_START_JOB_NAME:-sullivan-grading-worker-warm-start}"
WARM_STOP_JOB_NAME="${WARM_STOP_JOB_NAME:-sullivan-grading-worker-warm-stop}"
RECOMPUTE_STATS_DAILY_JOB_NAME="${RECOMPUTE_STATS_DAILY_JOB_NAME:-sullivan-grading-worker-recompute-stats-daily}"
WORKER_MIN_INSTANCES="${WORKER_MIN_INSTANCES:-0}"
WORKER_MAX_INSTANCES="${WORKER_MAX_INSTANCES:-50}"
SKIP_INFRA_SETUP="${SKIP_INFRA_SETUP:-0}"
DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME:-database-url}"
DIRECT_URL_SECRET_NAME="${DIRECT_URL_SECRET_NAME:-direct-url}"
GEMINI_API_KEY_SECRET_NAME="${GEMINI_API_KEY_SECRET_NAME:-gemini-api-key}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_MODEL="${GEMINI_CHAT_MODEL:-gemini-3.1-pro-preview}"
GEMINI_CHAT_FALLBACK_MODEL="${GEMINI_CHAT_FALLBACK_MODEL:-$GEMINI_CHAT_MODEL}"
CLOUD_TASKS_LOCATION="${CLOUD_TASKS_LOCATION:-asia-northeast1}"
GRADING_TASK_QUEUE="${GRADING_TASK_QUEUE:-sullivan-grading}"
DRIVE_CHECK_TASK_QUEUE="${DRIVE_CHECK_TASK_QUEUE:-sullivan-drive-check}"
GUIDANCE_SUMMARY_TASK_QUEUE="${GUIDANCE_SUMMARY_TASK_QUEUE:-sullivan-guidance-summary}"
CLOUD_TASKS_CALLER_SERVICE_ACCOUNT="${CLOUD_TASKS_CALLER_SERVICE_ACCOUNT:-$RUNTIME_SA_EMAIL}"
WORKER_SCHEDULER_CALLER_SERVICE_ACCOUNT="${WORKER_SCHEDULER_CALLER_SERVICE_ACCOUNT:-$RUNTIME_SA_EMAIL}"
INTERNAL_API_SECRET_NAME="${INTERNAL_API_SECRET_NAME:-internal-api-secret}"
CLOUD_RUN_REGION="${CLOUD_RUN_REGION:-asia-northeast1}"
CLOUD_BUILD_REGION="${CLOUD_BUILD_REGION:-asia-northeast1}"

normalize_cloud_build_region

if [ -z "${GRADING_WORKER_URL:-}" ]; then
  echo "GRADING_WORKER_URL is required in .env.PRODUCTION for worker self-queue publishing."
  exit 1
fi

echo "Deploying grading worker to Project: $GOOGLE_CLOUD_PROJECT_ID"
echo "Building worker image: $IMAGE_URI"
echo "Using worker base image: $WORKER_BASE_IMAGE_URI"
echo "Cloud Build region: $CLOUD_BUILD_REGION"

if [ "$SKIP_INFRA_SETUP" != "1" ]; then
  ensure_gcp_service_enabled "cloudscheduler.googleapis.com"
fi

ensure_secret_exists "$GEMINI_API_KEY_SECRET_NAME"
ensure_secret_exists "$DATABASE_URL_SECRET_NAME"
ensure_secret_exists "$DIRECT_URL_SECRET_NAME"
ensure_secret_exists "$INTERNAL_API_SECRET_NAME"

INTERNAL_API_SECRET_VALUE="$(resolve_secret_value "INTERNAL_API_SECRET" "$INTERNAL_API_SECRET_NAME")"

ensure_base_image "$WORKER_BASE_IMAGE_URI" "cloudbuild.worker-base.yaml"

run_cloud_build "cloudbuild.worker.yaml" "_IMAGE_URI=$IMAGE_URI,_BASE_IMAGE_URI=$WORKER_BASE_IMAGE_URI"

gcloud run deploy sullivan-grading-worker-production \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --service-account "$RUNTIME_SA_EMAIL" \
  --image "$IMAGE_URI" \
  --platform managed \
  --region asia-northeast1 \
  --memory 4Gi \
  --cpu 2 \
  --concurrency 1 \
  --min-instances "$WORKER_MIN_INSTANCES" \
  --max-instances "$WORKER_MAX_INSTANCES" \
  --timeout 300s \
  --quiet \
  --no-allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,SERVICE_ROLE=worker" \
  --update-secrets "DATABASE_URL=${DATABASE_URL_SECRET_NAME}:latest" \
  --update-secrets "DIRECT_URL=${DIRECT_URL_SECRET_NAME}:latest" \
  --update-secrets "INTERNAL_API_SECRET=${INTERNAL_API_SECRET_NAME}:latest" \
  --update-secrets "GEMINI_API_KEY=${GEMINI_API_KEY_SECRET_NAME}:latest" \
  --set-env-vars "GEMINI_MODEL=$GEMINI_MODEL" \
  --set-env-vars "GEMINI_CHAT_MODEL=$GEMINI_CHAT_MODEL" \
  --set-env-vars "GEMINI_CHAT_FALLBACK_MODEL=$GEMINI_CHAT_FALLBACK_MODEL" \
  --set-env-vars "GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL:-gemini-2.5-flash-native-audio-preview-09-2025}" \
  --set-env-vars "GEMINI_LIVE_API_VERSION=${GEMINI_LIVE_API_VERSION:-v1beta}" \
  --set-env-vars "GEMINI_LIVE_VOICE=${GEMINI_LIVE_VOICE:-Aoede}" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "GRADING_WORKER_URL=$GRADING_WORKER_URL" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT_ID=$GOOGLE_CLOUD_PROJECT_ID" \
  --set-env-vars "CLOUD_TASKS_LOCATION=$CLOUD_TASKS_LOCATION" \
  --set-env-vars "GRADING_TASK_QUEUE=$GRADING_TASK_QUEUE" \
  --set-env-vars "DRIVE_CHECK_TASK_QUEUE=$DRIVE_CHECK_TASK_QUEUE" \
  --set-env-vars "GUIDANCE_SUMMARY_TASK_QUEUE=$GUIDANCE_SUMMARY_TASK_QUEUE" \
  --set-env-vars "CLOUD_TASKS_CALLER_SERVICE_ACCOUNT=$CLOUD_TASKS_CALLER_SERVICE_ACCOUNT" \
  --set-env-vars "CLOUD_RUN_REGION=$CLOUD_RUN_REGION" \
  --set-env-vars "RUNTIME_SA_EMAIL=$RUNTIME_SA_EMAIL"

gcloud run services update-traffic "$SERVICE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --region asia-northeast1 \
  --to-latest >/dev/null

if [ "$SKIP_INFRA_SETUP" != "1" ]; then
  PROJECT_NUMBER="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT_ID" --format='value(projectNumber)')"
  CLOUD_SCHEDULER_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --region asia-northeast1 \
    --member "serviceAccount:$CLOUD_TASKS_CALLER_SERVICE_ACCOUNT" \
    --role "roles/run.invoker" \
    --quiet >/dev/null

  gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT_ID" \
    --member "serviceAccount:$RUNTIME_SA_EMAIL" \
    --role "roles/cloudtasks.enqueuer" \
    --quiet >/dev/null

  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --member "serviceAccount:$RUNTIME_SA_EMAIL" \
    --role "roles/iam.serviceAccountUser" \
    --quiet >/dev/null

  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --region asia-northeast1 \
    --member "serviceAccount:$RUNTIME_SA_EMAIL" \
    --role "roles/run.admin" \
    --quiet >/dev/null

  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --region asia-northeast1 \
    --member "serviceAccount:$WORKER_SCHEDULER_CALLER_SERVICE_ACCOUNT" \
    --role "roles/run.invoker" \
    --quiet >/dev/null

  gcloud iam service-accounts add-iam-policy-binding "$WORKER_SCHEDULER_CALLER_SERVICE_ACCOUNT" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --member "serviceAccount:$CLOUD_SCHEDULER_SERVICE_AGENT" \
    --role "roles/iam.serviceAccountUser" \
    --quiet >/dev/null

  WORKER_SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
    --project "$GOOGLE_CLOUD_PROJECT_ID" \
    --region asia-northeast1 \
    --format='value(status.url)')"

  if [ -z "$WORKER_SERVICE_URL" ]; then
    echo "Failed to resolve Worker service URL"
    exit 1
  fi

  WORKER_SCALING_API_URL="$WORKER_SERVICE_URL/api/internal/cloud-run/min-instances"

  upsert_scheduler_job \
    "$WARM_START_JOB_NAME" \
    "0 15 * * 1-5" \
    "$WORKER_SCALING_API_URL" \
    '{"minInstances":1,"reason":"weekday-warm-start"}'

  upsert_scheduler_job \
    "$WARM_STOP_JOB_NAME" \
    "0 22 * * 1-5" \
    "$WORKER_SCALING_API_URL" \
    '{"minInstances":0,"reason":"weekday-warm-stop"}'

  # UserStatsDaily の日次再集計（昨日 UTC 1 日分を全ユーザに対して再集計）。
  # JST 10:00 (= UTC 01:00) 時点で「昨日 UTC」は完全に確定済み。
  RECOMPUTE_STATS_DAILY_API_URL="$WORKER_SERVICE_URL/api/internal/recompute-stats-daily"
  upsert_scheduler_job \
    "$RECOMPUTE_STATS_DAILY_JOB_NAME" \
    "0 10 * * *" \
    "$RECOMPUTE_STATS_DAILY_API_URL" \
    ''
fi
