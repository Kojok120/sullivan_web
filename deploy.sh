#!/bin/bash

# Load .env.production variables for deployment
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
else
  echo ".env.production file not found!"
  exit 1
fi

echo "Deploying to Project: $YOUR_PROJECT_ID"
echo "Database URL: [REDACTED]"

# Deploy Command
gcloud run deploy sullivan-app \
  --project "$YOUR_PROJECT_ID" \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --memory 4Gi \
  --cpu 2 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "DATABASE_URL=$DATABASE_URL" \
  --set-env-vars "DIRECT_URL=$DIRECT_URL" \
  --set-env-vars "QSTASH_TOKEN=$QSTASH_TOKEN" \
  --set-env-vars "QSTASH_CURRENT_SIGNING_KEY=$QSTASH_CURRENT_SIGNING_KEY" \
  --set-env-vars "QSTASH_NEXT_SIGNING_KEY=$QSTASH_NEXT_SIGNING_KEY" \
  --set-env-vars "UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL" \
  --set-env-vars "UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN" \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set-env-vars "GEMINI_MODEL=$GEMINI_MODEL" \
  --set-env-vars "JWT_SECRET=$JWT_SECRET" \
  --set-env-vars "DRIVE_FOLDER_ID=$DRIVE_FOLDER_ID" \
  --set-env-vars "APP_URL=https://sullivan-app-97352275682.asia-northeast1.run.app" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --set-env-vars "INTERNAL_API_SECRET=$INTERNAL_API_SECRET" \
  --set-env-vars "DRIVE_WEBHOOK_CHANNEL_ID=$DRIVE_WEBHOOK_CHANNEL_ID" \
  --set-env-vars "GOOGLE_APPLICATION_CREDENTIALS=/secrets/service-account.json" \
  --set-secrets="/secrets/service-account.json=sullivan-service-account:latest"

