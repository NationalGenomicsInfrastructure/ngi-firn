#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

export CLOUDANT_TEST_DATABASE="${CLOUDANT_TEST_DATABASE:-firn_bombadil}"
export PORT="${BOMBADIL_PORT:-3107}"
export HOST=127.0.0.1
export NUXT_PORT="$PORT" NITRO_PORT="$PORT" NUXT_HOST="$HOST" NITRO_HOST="$HOST"
export BOMBADIL_APP_ORIGIN="http://$HOST:$PORT"
export NUXT_APP_URL="$BOMBADIL_APP_ORIGIN"
# This pilot is loopback HTTP, including when the regular dev setup uses HTTPS.
export LOCALHOST_HTTPS_KEY="" LOCALHOST_HTTPS_CERT=""
START_CMD="${BOMBADIL_START_CMD:-pnpm dev --no-fork}"
BOMBADIL_BIN="${BOMBADIL_BIN:-pnpm exec bombadil}"
OUTPUT_PATH="${BOMBADIL_OUTPUT_PATH:-tests/bombadil/.artifacts/output}"
ARTIFACT_DIR=tests/bombadil/.artifacts

# Fail before seeding or contacting an existing application.
node --input-type=module <<'JS'
import { createServer } from 'node:net'
const port = Number(process.env.PORT)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('BOMBADIL_PORT must be an integer between 1024 and 65535.')
}
const server = createServer()
server.once('error', error => {
  console.error(`Cannot reserve pilot port ${port}: ${error.message}`)
  process.exitCode = 1
})
server.listen(port, process.env.HOST, () => server.close())
JS

mkdir -p "$ARTIFACT_DIR"
if [[ -e "$ARTIFACT_DIR/created-ids.json" || -e "$ARTIFACT_DIR/fixture.json" ]]; then
  echo "An earlier fixture remains. Run pnpm exec tsx tests/bombadil/fixtures/cleanup.ts with its original database configuration before retrying." >&2
  exit 1
fi
if ! mkdir "$ARTIFACT_DIR/run.lock"; then
  echo "Another pilot owns run.lock. If it was forcibly killed, recover its fixture before removing the stale lock." >&2
  exit 1
fi

APP_PID=""
FUZZ_PID=""

process_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" || true); do
    process_tree "$child"
  done
  printf '%s\n' "$pid"
}

stop_process() {
  local pid="$1" target
  local pids=()
  [[ -n "$pid" ]] || return 0
  while IFS= read -r target; do pids+=("$target"); done < <(process_tree "$pid")
  for target in "${pids[@]}"; do kill "$target" 2>/dev/null || true; done
  sleep 1
  for target in "${pids[@]}"; do
    if kill -0 "$target" 2>/dev/null; then kill -KILL "$target" 2>/dev/null || true; fi
  done
  wait "$pid" 2>/dev/null || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  stop_process "$FUZZ_PID"
  stop_process "$APP_PID"
  if ! tsx tests/bombadil/fixtures/cleanup.ts; then
    echo "Fixture cleanup failed; the document journal has been retained." >&2
    if [[ "$status" -eq 0 ]]; then status=1; fi
  fi
  rmdir "$ARTIFACT_DIR/run.lock"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> Seeding disposable fixture in '$CLOUDANT_TEST_DATABASE'..."
tsx tests/bombadil/fixtures/seed.ts

echo "==> Starting app at $BOMBADIL_APP_ORIGIN..."
# Simple command plus arguments, not a shell expression.
CLOUDANT_DATABASE="$CLOUDANT_TEST_DATABASE" $START_CMD &
APP_PID=$!
for attempt in $(seq 1 90); do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "App process exited before becoming ready." >&2
    exit 1
  fi
  if curl --max-time 2 -fsS "$BOMBADIL_APP_ORIGIN/" >/dev/null 2>&1; then break; fi
  if [[ "$attempt" -eq 90 ]]; then
    echo "App did not become ready in time." >&2
    exit 1
  fi
  sleep 2
done

echo "==> Authenticating and verifying fixture identity..."
COOKIE_PAIRS="$(tsx tests/bombadil/fixtures/login.ts)"
kill -0 "$APP_PID"
COOKIE_ARGS=()
while IFS= read -r pair; do
  [[ -n "$pair" ]] && COOKIE_ARGS+=(--cookie "$pair")
done <<< "$COOKIE_PAIRS"

# Only public fixture barcodes enter the specification, never its token or cookie.
SCAN_URL="$(node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises'
const fixture = JSON.parse(await readFile('tests/bombadil/.artifacts/fixture.json', 'utf8'))
const codes = Object.values(fixture.barcodes)
if (codes.length !== 5 || codes.some(code => typeof code !== 'string' || !code)) {
  throw new Error('The pilot requires five nonempty fixture barcodes.')
}
const url = new URL('/scan', process.env.BOMBADIL_APP_ORIGIN)
url.searchParams.set('bombadilCodes', JSON.stringify(codes))
console.log(url.href)
JS
)"

echo "==> Exploring the scanner..."
# URL filtering is defence in depth; the spec also excludes logout button actions.
run_bombadil() {
  # Bombadil prints cookies in its replay command. Keep them out of terminal/CI logs.
  # pipefail preserves the browser's exit status through the redaction pipeline.
  # shellcheck disable=SC2086
  $BOMBADIL_BIN browser test \
    --time-limit "${BOMBADIL_TIME_LIMIT:-2m}" \
    --output-path "$OUTPUT_PATH" \
    --output-path-overwrite \
    --allow-url "http://127.0.0.1/scan*" \
    "${COOKIE_ARGS[@]}" \
    ${BOMBADIL_EXTRA_ARGS:-} \
    "$SCAN_URL" tests/bombadil/specs/scan.spec.ts 2>&1 \
    | sed -E 's/--cookie(=|[[:space:]]+)[^[:space:]]+/--cookie [redacted]/g'
}
run_bombadil &
FUZZ_PID=$!
wait "$FUZZ_PID"
FUZZ_PID=""
