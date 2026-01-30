#!/bin/bash

echo "Deploying migrations to PRODUCTION..."

if [ -f .env.PRODUCTION ]; then
  export $(grep -v '^#' .env.PRODUCTION | xargs)
else
  echo "Error: .env.PRODUCTION file not found!"
  exit 1
fi

echo "Running prisma migrate deploy..."
npx prisma migrate deploy

echo "Done."
