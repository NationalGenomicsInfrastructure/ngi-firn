#!/bin/bash
#
# Single-container process supervisor for NGI Firn.
#
# Runs two long-lived processes side by side:
#   1. Meilisearch — the global-search engine. It holds only DERIVED data, so it
#      binds to loopback (127.0.0.1:7700) ONLY and is never published. Its index
#      lives in a dedicated writable volume so it survives restarts and can be
#      rebuilt from CouchDB at any time.
#   2. The Nuxt/Nitro server — the actual application, listening on $PORT.
#
# Signals are forwarded to both children and both are reaped; if either process
# exits the container stops with that process's status so the orchestrator can
# restart it. dumb-init is PID 1 (see the Dockerfile ENTRYPOINT) and handles
# zombie reaping; this script owns start/stop ordering and signal fan-out.

set -euo pipefail

MEILI_HTTP_ADDR="127.0.0.1:7700"
MEILI_DB_PATH="${MEILI_DB_PATH:-/data/meili}"
MEILI_DUMP_DIR="${MEILI_DUMP_DIR:-/data/meili/dumps}"
MEILI_SNAPSHOT_DIR="${MEILI_SNAPSHOT_DIR:-/data/meili/snapshots}"

mkdir -p "$MEILI_DB_PATH" "$MEILI_DUMP_DIR" "$MEILI_SNAPSHOT_DIR"

# Make the application talk to the local engine unless an external host was
# explicitly configured (e.g. a managed Meilisearch cluster).
export MEILISEARCH_HOST="${MEILISEARCH_HOST:-http://127.0.0.1:7700}"

# Meilisearch refuses to boot in `--env production` without a master key. When a
# key is provided we run hardened production mode; otherwise fall back to the
# development profile so local/staging images still start (search stays private
# either way because it only listens on loopback).
MEILI_ENV_ARGS=(--env development)
if [[ -n "${MEILISEARCH_API_KEY:-}" ]]; then
  MEILI_ENV_ARGS=(--env production --master-key "$MEILISEARCH_API_KEY")
fi

MEILI_PID=""
APP_PID=""

terminate() {
  trap - TERM INT
  [[ -n "$APP_PID" ]] && kill -TERM "$APP_PID" 2>/dev/null || true
  [[ -n "$MEILI_PID" ]] && kill -TERM "$MEILI_PID" 2>/dev/null || true
}
trap terminate TERM INT

meilisearch \
  --http-addr "$MEILI_HTTP_ADDR" \
  --db-path "$MEILI_DB_PATH" \
  --dump-dir "$MEILI_DUMP_DIR" \
  --snapshot-dir "$MEILI_SNAPSHOT_DIR" \
  --no-analytics \
  "${MEILI_ENV_ARGS[@]}" &
MEILI_PID=$!

"$@" &
APP_PID=$!

# Exit as soon as either child exits, then stop the other and propagate status.
wait -n "$MEILI_PID" "$APP_PID"
STATUS=$?
terminate
wait 2>/dev/null || true
exit "$STATUS"
