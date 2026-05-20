#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rm -rf "$ROOT_DIR/frontend/node_modules" "$ROOT_DIR/frontend/dist"
rm -rf "$ROOT_DIR/node_modules" "$ROOT_DIR/dist"
rm -f "$ROOT_DIR"/LifeOS-share-*.zip

echo "Workspace build artifacts removed."
echo "Browser localStorage is not changed by this script."
echo "To reset app data, open LifeOS -> 备份 -> 重置本地数据."
