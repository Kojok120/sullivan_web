#!/bin/bash

# Configuration
JOB_NAME="sullivan-drive-watch-renew"
SCHEDULE="0 */6 * * *" # Every 6 hours to ensure renewal within 24h expiry cap
URI="https://sullivan-app-97352275682.asia-northeast1.run.app/api/drive/watch/setup"
REGION="asia-northeast1"
PROJECT_ID="sullivan-dev-480803"

# Secret (Should be loaded from env or safe storage, but for this setup script we use the known secret)
# In production, consider using OIDC authentication, but for now we use the Internal Secret header as per current architecture.
INTERNAL_API_SECRET="98be48a0ac6a87a01f2097ce78c71a379f1b90f407408115dcb66ce543b583c7"

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
