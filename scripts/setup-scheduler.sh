#!/bin/bash
set -euo pipefail

# Optional .env loader
if [ -n "${ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Configuration (override via env vars)
JOB_NAME="${JOB_NAME:-sullivan-drive-watch-renew}"
SCHEDULE="${SCHEDULE:-0 */6 * * *}" # Every 6 hours to renew before expiry
REGION="${REGION:-asia-northeast1}"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID:-${PROJECT_ID:-}}"
APP_URL="${APP_URL:-}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"

if [ -z "$APP_URL" ] || [ -z "$PROJECT_ID" ] || [ -z "$INTERNAL_API_SECRET" ]; then
  echo "Missing required env. Set APP_URL, GOOGLE_CLOUD_PROJECT_ID (or PROJECT_ID), and INTERNAL_API_SECRET."
  exit 1
fi

URI="${APP_URL%/}/api/drive/watch/renew?check=1"

echo "Creating/Updating Cloud Scheduler Job: $JOB_NAME"

# Delete if exists to ensure clean state
if gcloud scheduler jobs describe $JOB_NAME --location="$REGION" --project="$PROJECT_ID" > /dev/null 2>&1; then
  echo "Job exists. Deleting..."
  gcloud scheduler jobs delete $JOB_NAME --location="$REGION" --project="$PROJECT_ID" --quiet
fi

echo "Creating Cloud Scheduler Job: $JOB_NAME"

gcloud scheduler jobs create http $JOB_NAME \
  --schedule="$SCHEDULE" \
  --uri="$URI" \
  --http-method=POST \
  --headers="Authorization=Bearer $INTERNAL_API_SECRET" \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --description="Renew Google Drive Push Notification Watch" \
  --time-zone="Asia/Tokyo"

echo "Done."
