#!/bin/bash

compute_file_hash() {
  local file_hash
  local file_path
  local digest_input=""
  local hash_cmd

  if command -v sha256sum >/dev/null 2>&1; then
    hash_cmd="sha256sum"
  else
    hash_cmd="shasum -a 256"
  fi

  for file_path in "$@"; do
    if [ ! -r "$file_path" ]; then
      echo "Missing or unreadable file: $file_path" >&2
      return 1
    fi

    if [ "$hash_cmd" = "sha256sum" ]; then
      file_hash="$(sha256sum "$file_path" | awk '{print $1}')"
    else
      file_hash="$(shasum -a 256 "$file_path" | awk '{print $1}')"
    fi

    digest_input+="${file_path}:${file_hash}"$'\n'
  done

  if [ "$hash_cmd" = "sha256sum" ]; then
    printf '%s' "$digest_input" | sha256sum | awk '{print substr($1, 1, 16)}'
    return 0
  fi

  printf '%s' "$digest_input" | shasum -a 256 | awk '{print substr($1, 1, 16)}'
}

normalize_cloud_build_region() {
  CLOUD_BUILD_REGION="${CLOUD_BUILD_REGION:-asia-northeast1}"

  if [ "$CLOUD_BUILD_REGION" = "global" ]; then
    CLOUD_BUILD_REGION="asia-northeast1"
  fi
}

image_exists() {
  local image_uri="$1"
  gcloud container images describe "$image_uri" >/dev/null 2>&1
}

run_cloud_build() {
  local config_path="$1"
  local substitutions="${2:-}"
  local project_id="${3:-${GOOGLE_CLOUD_PROJECT_ID:-}}"
  local cloud_build_region="${4:-${CLOUD_BUILD_REGION:-}}"

  if [ -z "$project_id" ]; then
    echo "Missing required Google Cloud project for Cloud Build" >&2
    return 1
  fi

  if [ -z "$cloud_build_region" ]; then
    echo "Missing required Cloud Build region" >&2
    return 1
  fi

  local args=(
    builds submit
    --project "$project_id"
    --region "$cloud_build_region"
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

ensure_secret_exists() {
  local secret_name="$1"

  if gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT_ID" >/dev/null 2>&1; then
    return 0
  fi

  echo "Missing required Secret Manager secret: $secret_name"
  return 1
}
