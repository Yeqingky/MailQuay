#!/usr/bin/env bash
set -euo pipefail

: "${MAILQUAY_TEST_DATABASE_URL:?set MAILQUAY_TEST_DATABASE_URL to a disposable PostgreSQL database}"

PORT="${MAILQUAY_E2E_PORT:-18080}"
TOKEN="${MAILQUAY_E2E_SETUP_TOKEN:-amz-qvqrg-2sxnr-5t7c1d}"
if [ -z "${MAILQUAY_E2E_SECRET_KEY:-}" ]; then
  MAILQUAY_E2E_SECRET_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
fi
SECRET="$MAILQUAY_E2E_SECRET_KEY"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d frontend/node_modules ]; then
  echo "frontend dependencies are missing; run: cd frontend && corepack pnpm install --frozen-lockfile" >&2
  exit 1
fi

echo "building frontend" >&2
(cd frontend && timeout 600 corepack pnpm build)

echo "building full backend" >&2
rm -rf internal/webassets/dist
mkdir -p internal/webassets
cp -R frontend/dist internal/webassets/dist
CGO_ENABLED=0 timeout 300 go build -trimpath -tags full -o bin/mailquay-e2e ./cmd/mailquay

echo "resetting test database" >&2
timeout 120 go run ./test/e2e/resetdb

DATA_DIR="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT INT TERM

export MAILQUAY_DATABASE_URL="$MAILQUAY_TEST_DATABASE_URL"
export MAILQUAY_DATA_DIR="$DATA_DIR"
export MAILQUAY_LISTEN_ADDR="127.0.0.1:${PORT}"
export MAILQUAY_PUBLIC_URL="http://127.0.0.1:${PORT}"
export MAILQUAY_SECRET_KEY="$SECRET"
export MAILQUAY_SETUP_TOKEN="$TOKEN"
export MAILQUAY_LOG_LEVEL="${MAILQUAY_E2E_LOG_LEVEL:-warn}"

echo "running migrations" >&2
"$ROOT/bin/mailquay-e2e" migrate up

echo "starting MailQuay on http://127.0.0.1:${PORT}" >&2
"$ROOT/bin/mailquay-e2e" serve &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    echo "server is ready" >&2
    wait "$SERVER_PID"
    exit $?
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server exited before becoming ready" >&2
    exit 1
  fi
  sleep 1
done

echo "server did not become ready in 60 seconds" >&2
exit 1
