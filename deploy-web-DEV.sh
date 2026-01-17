#!/bin/bash

# Load .env.DEV variables for deployment
if [ -f .env.DEV ]; then
  export $(grep -v '^#' .env.DEV | xargs)
else
  echo ".env.DEV file not found!"
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

cat > .env.build <<EOF
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
EOF

RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sullivan-runtime@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com}"

echo "Deploying to Project: $GOOGLE_CLOUD_PROJECT_ID"

# Deploy Command
gcloud run deploy sullivan-app-dev \
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
  --set-env-vars "QSTASH_TOKEN=$QSTASH_TOKEN" \
  --set-env-vars "QSTASH_CURRENT_SIGNING_KEY=$QSTASH_CURRENT_SIGNING_KEY" \
  --set-env-vars "QSTASH_NEXT_SIGNING_KEY=$QSTASH_NEXT_SIGNING_KEY" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN" \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set-env-vars "GEMINI_MODEL=$GEMINI_MODEL" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "APP_URL=$APP_URL" \
  --set-build-env-vars "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
  --set-build-env-vars "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
  --update-secrets "INTERNAL_API_SECRET=internal-api-secret:latest" \
  --update-secrets "DRIVE_WEBHOOK_TOKEN=drive-webhook-token:latest" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID=$DRIVE_WEBHOOK_CHANNEL_ID" \
  --set-env-vars "GRADING_WORKER_URL=$GRADING_WORKER_URL"
