#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required to create the share package."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="LifeOS-share-$STAMP.zip"
TMP_LIST="$(mktemp)"
trap 'rm -f "$TMP_LIST"' EXIT

find . \
  \( -path "./.git" -o -path "./node_modules" -o -path "./frontend/node_modules" -o -path "./dist" -o -path "./frontend/dist" \) -prune -o \
  \( -name ".env" -o \( -name ".env.*" ! -name ".env.example" \) -o -name "*.log" -o -name "*.zip" -o -name ".DS_Store" -o -name "*.local.json" -o -name "*.private.json" \) -prune -o \
  -type f -print | sed 's#^\./##' > "$TMP_LIST"

zip -q "$OUT" -@ < "$TMP_LIST"

echo "Created $ROOT_DIR/$OUT"
