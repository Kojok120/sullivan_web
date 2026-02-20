#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load DEV env vars
if [ -f .env.DEV ]; then
  export $(grep -v '^#' .env.DEV | xargs)
else
  echo ".env.DEV file not found!"
  exit 1
fi

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_URI="${IMAGE_URI:-asia.gcr.io/${GOOGLE_CLOUD_PROJECT_ID}/sullivan-grading-worker-dev:${IMAGE_TAG}}"
WORKER_MIN_INSTANCES="${WORKER_MIN_INSTANCES:-0}"
WORKER_MAX_INSTANCES="${WORKER_MAX_INSTANCES:-10}"
QSTASH_TOKEN_SECRET_NAME="${QSTASH_TOKEN_SECRET_NAME:-qstash-token}"
QSTASH_CURRENT_SIGNING_KEY_SECRET_NAME="${QSTASH_CURRENT_SIGNING_KEY_SECRET_NAME:-qstash-current-signing-key}"
QSTASH_NEXT_SIGNING_KEY_SECRET_NAME="${QSTASH_NEXT_SIGNING_KEY_SECRET_NAME:-qstash-next-signing-key}"

if [ -z "${GRADING_WORKER_URL:-}" ]; then
  echo "GRADING_WORKER_URL is required in .env.DEV for worker self-queue publishing."
  exit 1
fi
if [ -z "${QSTASH_TOKEN_SECRET_NAME:-}" ] || [ -z "${QSTASH_CURRENT_SIGNING_KEY_SECRET_NAME:-}" ] || [ -z "${QSTASH_NEXT_SIGNING_KEY_SECRET_NAME:-}" ]; then
  echo "QSTASH secret names are required (QSTASH_TOKEN_SECRET_NAME / QSTASH_CURRENT_SIGNING_KEY_SECRET_NAME / QSTASH_NEXT_SIGNING_KEY_SECRET_NAME)."
  exit 1
fi
for secret_name in "$QSTASH_TOKEN_SECRET_NAME" "$QSTASH_CURRENT_SIGNING_KEY_SECRET_NAME" "$QSTASH_NEXT_SIGNING_KEY_SECRET_NAME"; do
  if ! gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null 2>&1; then
    echo "Secret not found: $secret_name (required for QStash signature verification / publishing)."
    exit 1
  fi
done

echo "Deploying grading worker to Project: $GOOGLE_CLOUD_PROJECT_ID"
echo "Building worker image: $IMAGE_URI"

gcloud builds submit \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --config cloudbuild.worker.yaml \
  --substitutions "_IMAGE_URI=$IMAGE_URI" \
  .

gcloud run deploy sullivan-grading-worker-dev \
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
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=development,SERVICE_ROLE=worker" \
  --update-secrets "DATABASE_URL=database-url:latest" \
  --update-secrets "DIRECT_URL=direct-url:latest" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN" \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set-env-vars "GEMINI_MODEL=$GEMINI_MODEL" \
  --set-env-vars "GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL:-gemini-2.5-flash-native-audio-preview-09-2025}" \
  --set-env-vars "GEMINI_LIVE_API_VERSION=${GEMINI_LIVE_API_VERSION:-v1beta}" \
  --set-env-vars "GEMINI_LIVE_VOICE=${GEMINI_LIVE_VOICE:-Aoede}" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "GRADING_WORKER_URL=$GRADING_WORKER_URL" \
  --update-secrets "QSTASH_TOKEN=${QSTASH_TOKEN_SECRET_NAME}:latest" \
  --update-secrets "QSTASH_CURRENT_SIGNING_KEY=${QSTASH_CURRENT_SIGNING_KEY_SECRET_NAME}:latest" \
  --update-secrets "QSTASH_NEXT_SIGNING_KEY=${QSTASH_NEXT_SIGNING_KEY_SECRET_NAME}:latest"
