# Bombadil (property-based frontend testing)

## A motivating example

A [famous developer joke](https://www.reddit.com/r/Jokes/comments/prdi4x/a_software_tester_walks_into_a_bar/) goes approximately so:

> A software tester walks into a bar...
> ... runs into a bar.
> ... crawls into a bar.
> ... dances into a bar.
> ... flies into a bar.
> ... jumps into a bar.
>
> He orders...
> ... a beer.
> ... two beers.
> ... 0 beers.
> ... 99999999 beers.
> ... a lizard in a beer glass.
> ... minus one beer.
> ... "qwertyuiop" beers.
> Testing complete.
>
> A real customer walks into the bar and asks where the bathroom is. The bar goes up in flames.

The joke illustrates that example-based testing, especially when browser testing, is costly and limited. Limited, in that they only test very small parts of the state space; a bunch of distinct cases, a set of regression tests, and maybe even some error handling cases that are important. But they miss out on many combinations that were not considered. Also because the user interface typically changes rapidly, maintaining suites of Playwright or Cypress tests takes a lot of work even in the age of AI.

Hence, for Firn the frontend tests will be run with property-based testing instead (or fuzzing if you will). By randomly and systematically searching the state space, [Bombadil](https://github.com/antithesishq/bombadil) may probe strange inputs, unexpected sequences of actions and weird timings that a human-curated test case would not have covered.

## How Bombadil works

[Bombadil](https://github.com/antithesishq/bombadil) is a property-based /
fuzzing UI tester from Antithesis. Instead of scripting fixed steps, we declare
**properties** (invariants that must hold in *every* state) and Bombadil drives
the real page autonomously — clicking, typing and navigating — trying to reach a
state that breaks one of them. A specification is TypeScript that exports
properties plus action generators.

Bombadil runs with a scheduled GitHub action for 3 minutes weekly. Because the state space exploration is random, a bug may not be discovered on the first try. But ultimately, it will surface sooner or later.

## Isolation and safety guarantees

The frontend tests make use of the following restrictions:

- **Dedicated database.** Everything runs against `CLOUDANT_TEST_DATABASE`
  (default `firn_bombadil`), never the app database `CLOUDANT_DATABASE`. The
  guard in `tests/bombadil/fixtures/env.ts` **throws** if the two coincide, mirroring
  `tests/setup/integration.ts`. It must be imported before any server module,
  because the `couchDB` singleton reads the database name once at construction.
- **Self-contained fixture.** `tests/bombadil/fixtures/seed.ts` creates its own throwaway
  data — an approved user plus a freezer → 2 boxes → 2 vials hierarchy — reusing
  the integration fixture helpers (`tests/integration/fixtures.ts`), and records
  each returned document ID immediately in a separate cleanup journal, including
  the user and room before later provisioning can fail.
- **Real login** The fixture issues a short-lived (1 h) QR login
  token with the required `User Login` audience. This means the tests can run on parts of Firn that are restricted to authenticated users without dealing with OAuth.
  `tests/bombadil/fixtures/login.ts` exchanges that token for a genuine session cookie
  through the production token-login endpoint (`/api/auth/token`); that cookie is
  what gets injected into the browser. Both the response status and the
  authenticated `getUserInfoSelf` identity must match before exploration starts.
  Rejection cookies are not accepted. No production authentication bypass is used.
- **Dedicated listener.** The app binds to `127.0.0.1:3107` by default. An occupied
  port is rejected before seeding or making HTTP requests. The harness supplies
  the same host/port to Nuxt and Nitro, and checks that its app process is alive.
- **Recoverable teardown.** The shell trap stops its app/browser process trees and
  attempts cleanup on success, violation, time limit, SIGINT and SIGTERM. Failed
  document deletions retain a database-bound, credential-free journal for retry;
  corrupt journals cause an error rather than being silently discarded. Cleanup
  failure makes an otherwise successful run fail. Cookie/token files are removed
  during cleanup, the cookie in Bombadil's printed replay command is redacted,
  and only traces are uploaded.

SIGKILL, machine failure, and a crash between a database write and journaling its
returned ID cannot be covered by a shell trap. A lock prevents concurrent local
runs from overwriting each other's artifacts. After an interrupted run, retry
cleanup using the **same database configuration**:

```bash
pnpm exec tsx tests/bombadil/fixtures/cleanup.ts
```

Only if no pilot is still running, remove a stale lock with
`rmdir tests/bombadil/.artifacts/run.lock`. If a journal is corrupt, preserve and
repair it before retrying. Unjournaled `BCTEST` documents require manual cleanup
in the disposable database; never sweep the application database.

## Local prerequisites

- **Node ≥ 24** and **pnpm** (enforced project-wide).
- A **running CouchDB** reachable via `CLOUDANT_URL`/`CLOUDANT_USERNAME`/
  `CLOUDANT_PASSWORD` (the same instance you use for `pnpm test`).
- **Google Chrome / Chrome for Testing.** The `@antithesishq/bombadil` npm
  package bundles its own `bombadil` binaries but **not** a browser. Bombadil
  locates Chrome via the `CHROME` environment variable; set it if Chrome is not
  on the default path:

  ```bash
  export CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ```

- The usual session env vars — `NUXT_SESSION_PASSWORD` (≥ 32 chars) and
  `NUXT_SESSION_SALT`. The harness sets `NUXT_APP_URL` to the pilot origin for
  both the seeder and app, so their token issuers agree.

## Commands

```bash
pnpm test:bombadil            # full pilot: seed → start app → login → explore → cleanup
pnpm test:bombadil:typecheck  # type-check the specification only (no run)
pnpm exec vitest run tests/integration/bombadil-harness.test.ts # focused harness regressions
```

Set `CHROME` for the real-DOM regression case as well; it is skipped when no
browser path is supplied. The Bombadil workflow always runs it with Chrome.

`pnpm test:bombadil` runs `tests/bombadil/run.sh`, which starts the app itself on
the test database. It does **not** touch your normal `pnpm dev` server or the app
database. Useful overrides (all optional):

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLOUDANT_TEST_DATABASE` | Disposable database name | `firn_bombadil` |
| `BOMBADIL_PORT` | Dedicated loopback port, 1024–65535 | `3107` |
| `BOMBADIL_START_CMD` | Simple command and arguments to start the app (no shell expressions) | `pnpm dev --no-fork` |
| `BOMBADIL_BIN` | How to invoke Bombadil | `pnpm exec bombadil` |
| `BOMBADIL_TIME_LIMIT` | Exploration budget | `2m` |
| `BOMBADIL_OUTPUT_PATH` | Trace/screenshots directory | `tests/bombadil/.artifacts/output` |
| `BOMBADIL_EXTRA_ARGS` | Extra Bombadil flags (e.g. `--headless --no-sandbox`) | — |

The runner derives `BOMBADIL_APP_ORIGIN` internally and disables the regular
development HTTPS configuration for its loopback HTTP listener. When running a
built server locally, export the session variables to that process as well.
Use current Chrome for Testing where possible. Older Chromium versions may
reject Bombadil's default `local-network` permission; for those versions,
`--chrome-grant-permissions=geolocation` avoids that unsupported permission for
this loopback-only pilot.

### Inspecting and reproducing a run

The trace is written to `BOMBADIL_OUTPUT_PATH`. After a run you can:

```bash
pnpm exec bombadil browser inspect tests/bombadil/.artifacts/output   # step through states
pnpm exec bombadil --help                                             # reproduce / other subcommands
```

Replay is **best-effort**: Bombadil explicitly does not guarantee an identical reproduction when execution diverges. Treat a trace as strong evidence plus a starting point, not a deterministic script.

The exit code is meaningful: **0** = ok, **1** = harness/error, **2** = a property
was violated.

## Continuous integration

`.github/workflows/bombadil.yml` runs the frontend tests **non-blockingly**:

- **Triggers:** `schedule` (weekly) and `workflow_dispatch` only — never
  `pull_request`.
- **Containerized test database** GitHub provides an ephemeral CouchDB **service
  container** (version pinned via the `couchdb-version` matrix — keep it in step
  with `integration-tests.yml`), and all credentials in the workflow are
  disposable test values.
- **Chrome** is installed with `browser-actions/setup-chrome`, and its path is
  passed to Bombadil through the `CHROME` env var.
- The job builds the app (`pnpm build`) and runs the built server for a cleaner
  signal than the dev server. `CLOUDANT_DATABASE` is intentionally left unset so
  the guard cannot be tripped; `run.sh` points only the app process at the test
  database.
- Only the **trace** (`tests/bombadil/.artifacts/output`) is uploaded as an
  artifact — never the fixture token or cookie file.

To run it on demand, use *Actions → Bombadil scanner pilot → Run workflow*
(optionally overriding the time limit).

## File map

| Path | Role |
|------|------|
| `tests/bombadil/specs/scan.spec.ts` | Properties and weighted, bounded scan actions. |
| `tests/bombadil/specs/scanner.ts`, `actions.ts` | DOM observations and action filtering. |
| `tests/bombadil/fixtures/env.ts` | DB-redirect safety guard + shared artifact paths/types. Import first. |
| `tests/bombadil/fixtures/seed.ts` | Provisions the disposable fixture and the login token. |
| `tests/bombadil/fixtures/login.ts` | Exchanges the token for a session cookie. |
| `tests/bombadil/fixtures/auth.ts` | Validates login status and authenticated fixture identity. |
| `tests/bombadil/fixtures/journal.ts` | Incremental ownership journal and retryable cleanup. |
| `tests/bombadil/fixtures/cleanup.ts` | Deletes fixture documents and on-disk secrets. |
| `tests/bombadil/run.sh` | Orchestrator wired to `pnpm test:bombadil`. |
| `tsconfig.bombadil.json` | Stand-alone type-check config for the spec. |
| `.github/workflows/bombadil.yml` | Scheduled, non-blocking CI. |
