#!/bin/bash

# PRODUCTION データベースをローカルに pg_dump するスクリプト
#
# いつ叩くか:
#   - PRODUCTION デプロイ直前
#   - prisma migrate deploy を伴う作業前
#   - 一括バックフィル / 一括削除 / 大きなデータ操作の前
#
# 復元手順は docs/deploy_runbook.md の「災害復旧（DR）」章を参照。
#
# 出力先: ~/sullivan-backups/production/sullivan-production-YYYYMMDD-HHMMSS.dump
#   第1引数で出力ディレクトリを上書き可能。
#
# 必要な権限:
#   - sullivan-production-483212 プロジェクトの Secret Manager Secret Accessor
#   - ローカルに pg_dump（PostgreSQL クライアント）がインストール済み

set -euo pipefail

GOOGLE_CLOUD_PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID:-sullivan-production-483212}"
DIRECT_URL_SECRET_NAME="${DIRECT_URL_SECRET_NAME:-direct-url}"
DEFAULT_OUTPUT_DIR="${HOME}/sullivan-backups/production"
OUTPUT_DIR="${1:-$DEFAULT_OUTPUT_DIR}"

# pg_dump はサーバ以上のメジャーバージョンが必要。
# Homebrew の keg-only な postgresql@N があればそれを優先し、
# Supabase のメジャーバージョンアップに追従できるようにする。
if [ -z "${PG_DUMP_BIN:-}" ]; then
  for ver in 20 19 18 17; do
    candidate="/opt/homebrew/opt/postgresql@${ver}/bin/pg_dump"
    if [ -x "$candidate" ]; then
      PG_DUMP_BIN="$candidate"
      break
    fi
  done
fi
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="$(dirname "$PG_DUMP_BIN")/pg_restore"
if [ ! -x "$PG_RESTORE_BIN" ]; then
  PG_RESTORE_BIN="pg_restore"
fi

if ! command -v "$PG_DUMP_BIN" >/dev/null 2>&1 && [ ! -x "$PG_DUMP_BIN" ]; then
  echo "pg_dump が見つかりません。Homebrew なら 'brew install postgresql@17' を実行してください。" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud が見つかりません。Google Cloud SDK をインストールしてください。" >&2
  exit 1
fi

echo "pg_dump bin: $PG_DUMP_BIN"
echo "pg_dump version: $("$PG_DUMP_BIN" --version)"
echo "Project: $GOOGLE_CLOUD_PROJECT_ID"
echo "Secret:  $DIRECT_URL_SECRET_NAME"
echo "Output:  $OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR"

# Secret Manager から DIRECT_URL を取得（session mode 接続文字列）。
# 出力に URL を含めないよう、変数経由でのみ pg_dump に渡す。
DIRECT_URL="$(gcloud secrets versions access latest \
  --secret="$DIRECT_URL_SECRET_NAME" \
  --project="$GOOGLE_CLOUD_PROJECT_ID")"

if [ -z "$DIRECT_URL" ]; then
  echo "DIRECT_URL の取得に失敗しました。" >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_PATH="$OUTPUT_DIR/sullivan-production-${TIMESTAMP}.dump"

echo "Dumping to: $DUMP_PATH"
"$PG_DUMP_BIN" \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --file="$DUMP_PATH" \
  "$DIRECT_URL"

unset DIRECT_URL

echo
echo "=== Dump completed ==="
ls -lh "$DUMP_PATH"
echo
echo "=== Dump TOC (head) ==="
"$PG_RESTORE_BIN" --list "$DUMP_PATH" | head -10
echo
echo "Done. 復元手順は docs/deploy_runbook.md を参照してください。"
