import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))

function runStartup(t, { dotenv, key } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'firn-entrypoint-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  mkdirSync(join(cwd, 'container_images'))
  mkdirSync(join(cwd, 'scripts'))
  mkdirSync(join(cwd, 'bin'))
  copyFileSync(join(root, 'package.json'), join(cwd, 'package.json'))
  copyFileSync(join(root, 'container_images/firn-entrypoint.sh'), join(cwd, 'container_images/firn-entrypoint.sh'))
  copyFileSync(join(root, 'scripts/dev-with-search.mjs'), join(cwd, 'scripts/dev-with-search.mjs'))
  if (dotenv !== undefined)
    writeFileSync(join(cwd, '.env'), dotenv)

  writeFileSync(join(cwd, 'bin/meilisearch'), `#!/bin/bash
trap 'touch "$TEST_DIR/meili-stopped"; exit 0' TERM INT
printf '%s\\n' "$@" > "$TEST_DIR/meili-args"
while :; do sleep 1; done
`, { mode: 0o755 })
  writeFileSync(join(cwd, 'bin/pnpm'), `#!/bin/bash
printf '%s' "$MEILISEARCH_API_KEY" > "$TEST_DIR/app-key"
printf '%s' "$MEILISEARCH_HOST" > "$TEST_DIR/app-host"
while [[ ! -f "$TEST_DIR/meili-args" ]]; do sleep 0.1; done
exit 0
`, { mode: 0o755 })

  const env = { ...process.env, PATH: `${join(cwd, 'bin')}:${process.env.PATH}`, TEST_DIR: cwd }
  for (const name of Object.keys(env)) {
    if (name.startsWith('MEILI') || name === 'NODE_OPTIONS')
      delete env[name]
  }
  if (key !== undefined)
    env.MEILISEARCH_API_KEY = key

  const result = spawnSync(process.execPath, ['--run=dev:with-search'], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 10000
  })
  assert.ifError(result.error)
  return { cwd, result }
}

test('loads the .env key for both Meilisearch and the app', (t) => {
  const key = 'test-only key with spaces & symbols'
  const { cwd, result } = runStartup(t, { dotenv: `MEILISEARCH_API_KEY="${key}"\n` })
  assert.equal(result.status, 0, result.stderr)
  const args = readFileSync(join(cwd, 'meili-args'), 'utf8').trimEnd().split('\n')
  assert.equal(args[args.indexOf('--master-key') + 1], key)
  assert.equal(args[args.indexOf('--env') + 1], 'production')
  assert.equal(args[args.indexOf('--http-addr') + 1], '127.0.0.1:7700')
  assert.equal(args[args.indexOf('--db-path') + 1], './.meili_data/data.ms')
  assert.equal(readFileSync(join(cwd, 'app-key'), 'utf8'), key)
  assert.equal(readFileSync(join(cwd, 'app-host'), 'utf8'), 'http://127.0.0.1:7700')
  assert.equal(existsSync(join(cwd, 'meili-stopped')), true)
})

test('exported keys take precedence over .env', (t) => {
  const key = 'exported-test-key'
  const { cwd, result } = runStartup(t, { dotenv: 'MEILISEARCH_API_KEY=file-test-key\n', key })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(cwd, 'app-key'), 'utf8'), key)
  assert.ok(readFileSync(join(cwd, 'meili-args'), 'utf8').includes(`--master-key\n${key}\n`))
})

test('supports an exported key without a .env file', (t) => {
  const { result } = runStartup(t, { key: 'exported-test-key' })
  assert.equal(result.status, 0, result.stderr)
})

for (const dotenv of [undefined, 'MEILISEARCH_API_KEY=\n']) {
  test(`rejects a ${dotenv === undefined ? 'missing' : 'empty'} key before starting either child`, (t) => {
    const { cwd, result } = runStartup(t, { dotenv })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /MEILISEARCH_API_KEY is required/)
    assert.equal(existsSync(join(cwd, 'meili-args')), false)
    assert.equal(existsSync(join(cwd, 'app-key')), false)
    assert.equal(existsSync(join(cwd, '.meili_data')), false)
  })
}
