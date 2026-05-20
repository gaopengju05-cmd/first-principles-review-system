#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
START_PORT="${PORT:-5173}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20 or newer, then run ./run.sh again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js with npm, then run ./run.sh again."
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Current version: $(node -v)"
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo "Cannot find frontend/package.json. Please run this script from the project root."
  exit 1
fi

find_free_port() {
  local port="$1"
  while [ "$port" -le 5299 ]; do
    if command -v lsof >/dev/null 2>&1; then
      if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        port=$((port + 1))
        continue
      fi
    fi
    echo "$port"
    return 0
  done
  return 1
}

PORT="$(find_free_port "$START_PORT")"
URL="http://127.0.0.1:$PORT/"

cd "$FRONTEND_DIR"

if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies..."
  npm ci
fi

echo "Starting LifeOS at $URL"
npm run dev -- --host 127.0.0.1 --port "$PORT" &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 80); do
  if command -v curl >/dev/null 2>&1 && curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    wait "$SERVER_PID"
    exit 1
  fi
  sleep 0.25
done

if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
fi

echo "LifeOS is running. Press Ctrl+C to stop."
wait "$SERVER_PID"
