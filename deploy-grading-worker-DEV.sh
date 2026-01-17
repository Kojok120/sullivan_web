#!/bin/bash
set -euo pipefail

# Load DEV env vars
if [ -f .env.DEV ]; then
  export $(grep -v '^#' .env.DEV | xargs)
else
  echo ".env.DEV file not found!"
  exit 1
fi

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"

echo "Deploying grading worker to Project: $GOOGLE_CLOUD_PROJECT_ID"

gcloud run deploy sullivan-grading-worker-dev \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --service-account "$RUNTIME_SA_EMAIL" \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --memory 4Gi \
  --cpu 2 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=development" \
  --set-env-vars "DATABASE_URL=$DATABASE_URL" \
  --set-env-vars "DIRECT_URL=$DIRECT_URL" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN" \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set-env-vars "GEMINI_MODEL=$GEMINI_MODEL" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "QSTASH_CURRENT_SIGNING_KEY=$QSTASH_CURRENT_SIGNING_KEY" \
  --set-env-vars "QSTASH_NEXT_SIGNING_KEY=$QSTASH_NEXT_SIGNING_KEY"
