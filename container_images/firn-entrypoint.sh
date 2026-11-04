#!/usr/bin/env bash
#
# Process supervisor for NGI Firn — used both inside the container images and for
# the local `pnpm dev:with-search` command.
#
# Runs two long-lived processes side by side:
#   1. Meilisearch — the global-search engine. It holds only DERIVED data, so it
#      binds to loopback (127.0.0.1:7700) ONLY and is never published. Its index
#      lives in a writable path ($MEILI_DB_PATH) so it survives restarts and can
#      be rebuilt from CouchDB at any time.
#   2. The command passed as arguments ("$@") — the application: the Nitro server
#      in the container, or `nuxi dev` locally.
#
# Signals are forwarded to both children and the supervisor exits as soon as
# either child exits (propagating its status), so the two always start and stop
# together. In the container dumb-init is PID 1 and handles zombie reaping (see
# the Dockerfile ENTRYPOINT); this script owns start/stop ordering and signal
# fan-out. It is intentionally bash-3.2 compatible (no `wait -n`) so it also runs
# under the stock macOS bash.

set -uo pipefail

MEILI_HTTP_ADDR="127.0.0.1:7700"
# $MEILI_DB_PATH is the writable ROOT (the container volume / local folder). The
# engine's data directory, dumps and snapshots are kept as SIBLINGS under it —
# the data directory must never contain the dump/snapshot folders, or Meilisearch
# fails to infer the database version on startup.
MEILI_ROOT="${MEILI_DB_PATH:-/data/meili}"
MEILI_DATA_PATH="${MEILI_ROOT}/data.ms"
MEILI_DUMP_DIR="${MEILI_DUMP_DIR:-${MEILI_ROOT}/dumps}"
MEILI_SNAPSHOT_DIR="${MEILI_SNAPSHOT_DIR:-${MEILI_ROOT}/snapshots}"

mkdir -p "$MEILI_ROOT" "$MEILI_DUMP_DIR" "$MEILI_SNAPSHOT_DIR"

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
  --db-path "$MEILI_DATA_PATH" \
  --dump-dir "$MEILI_DUMP_DIR" \
  --snapshot-dir "$MEILI_SNAPSHOT_DIR" \
  --no-analytics \
  "${MEILI_ENV_ARGS[@]}" &
MEILI_PID=$!

"$@" &
APP_PID=$!

# Exit as soon as either child exits, then stop the other and propagate status.
# bash 3.2 (stock macOS) has no `wait -n`, so poll both PIDs; a signal interrupts
# the sleep and runs the trap.
while kill -0 "$MEILI_PID" 2>/dev/null && kill -0 "$APP_PID" 2>/dev/null; do
  sleep 1
done

# Reap whichever child exited first to capture its status, then stop the other.
STATUS=0
if ! kill -0 "$APP_PID" 2>/dev/null; then
  wait "$APP_PID" 2>/dev/null
  STATUS=$?
elif ! kill -0 "$MEILI_PID" 2>/dev/null; then
  wait "$MEILI_PID" 2>/dev/null
  STATUS=$?
fi

terminate
wait 2>/dev/null || true
exit "$STATUS"
