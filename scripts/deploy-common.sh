#!/bin/bash

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
