#!/bin/bash

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

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"

echo "Deploying to Project: $GOOGLE_CLOUD_PROJECT_ID"

# Deploy Command
gcloud run deploy sullivan-app-production \
  --project "$GOOGLE_CLOUD_PROJECT_ID" \
  --service-account "$RUNTIME_SA_EMAIL" \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --memory 4Gi \
  --cpu 2 \
  --concurrency 20 \
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
  --set-env-vars "GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL:-gemini-2.5-flash-native-audio-preview-09-2025}" \
  --set-env-vars "GEMINI_LIVE_API_VERSION=${GEMINI_LIVE_API_VERSION:-v1beta}" \
  --set-env-vars "GEMINI_LIVE_VOICE=${GEMINI_LIVE_VOICE:-Aoede}" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "APP_URL=$APP_URL" \
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
  --set-env-vars "GRADING_WORKER_URL=$GRADING_WORKER_URL"
