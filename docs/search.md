# Global search (Meilisearch)

NGI Firn's global inventory/project search (`/inventory/search`) is backed by a
self-hosted **Meilisearch** Community Edition instance. Meilisearch holds only copies of data from CouchDB — it is never a source of truth, audit
trail, or the target of navigation/actions. It can be rebuilt from CouchDB at any
time.

## Architecture

```
CouchDB (inventory + read-only projects DB)
  │  rebuild / _changes sync  (server/search/indexer.ts, server/plugins/search-indexer.ts)
  ▼
Meilisearch  (two indexes: inventory + projects, scoped by env + source DB)
  ▲
  │  SearchService (server/search/service.ts) — bounded, filtered queries
tRPC  inventory.search.{search,projectGroupInventory,status}  (authedProcedure)
  ▲
  │  Pinia Colada queries + useInventorySearch composable
Vue  app/pages/inventory/search.vue
```

- **Server module**: `server/search/` — `config`, `client`, `state`,
  `projections`, `indexer`, `service`.
- **Indexing lifecycle**: a single Nitro plugin bootstraps a full rebuild, then
  runs a frequent incremental `_changes` sync (freshness) and an infrequent full
  rebuild (reconciles project grouping and prunes deletions). One active indexer
  per deployment; multi-replica coordination is out of scope.
- **Manual rebuild**: admins can force an immediate full rebuild from
  `/administration/search` (Administration → Search → Search maintenance). It calls
  the `inventory.search.rebuild` tRPC `adminProcedure`, which runs the rebuild
  detached (the request returns immediately as `accepted`/`already-running`) and
  reports index freshness, including the last full-rebuild time.
- **Graceful degradation**: when `MEILISEARCH_HOST` is unset or the engine is
  unreachable, the feature reports an explicit `unavailable`/`stale` state and
  the rest of the application is unaffected.

## Configuration

See `.env.example`. Server-only variables:

| Variable | Purpose |
|----------|---------|
| `MEILISEARCH_HOST` | Engine URL. Unset disables search. Container default `http://127.0.0.1:7700`. |
| `MEILISEARCH_API_KEY` | Master/API key. **Required** for `pnpm dev:with-search` and both containers. Never exposed to the browser. |
| `MEILISEARCH_INDEX_PREFIX` | Optional index namespace (default `firn`). Index names are additionally scoped by `CLOUDANT_DATABASE`. |
| `MEILISEARCH_SYNC_INTERVAL_MS` | Optional incremental-sync interval (default 30000, min 2000). |
| `MEILISEARCH_REBUILD_INTERVAL_MS` | Optional full-rebuild interval (default 86400000 / 24h, min 60000). Inventory changes are rare; the incremental sync keeps the index fresh, and admins can rebuild on demand from `/administration/search`. |

## Running it

### Local macOS development

The simplest option starts Meilisearch and the Nuxt dev server together, stopped
together with a single Ctrl-C, by reusing the same supervisor script the
containers use:

```bash
pnpm dev:with-search
```

This runs `container_images/firn-entrypoint.sh` with `MEILI_DB_PATH=./.meili_data`
(git-ignored) and `pnpm exec nuxi dev` as the supervised app. The script is
bash-3.2 compatible, so it works with the stock macOS bash. The engine's data
directory, dumps and snapshots are kept as siblings under that folder
(`./.meili_data/data.ms`, `./.meili_data/dumps`, `./.meili_data/snapshots`).
The command loads `.env` before starting either process; exported environment
variables take precedence. Set `MEILISEARCH_API_KEY` in `.env` or export it
(generate a strong key with `openssl rand -base64 32`). The supervisor always
passes this key via `--master-key` and uses Meilisearch's `--env production`
profile, even while Nuxt runs in development mode. A missing or empty key aborts
startup instead of running an unauthenticated engine.

Prerequisite: a local `meilisearch` binary on `PATH`
(<https://www.meilisearch.com/docs/learn/getting_started/installation>).

To run the engine yourself instead (e.g. a long-lived instance), start it
separately and point the app at it:

```bash
meilisearch --db-path ./.meili_data/data.ms --master-key <dev-key>
# in .env
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_API_KEY=<dev-key>
```

### Containers

Both container images bundle a **pinned** Meilisearch binary and supervise it
alongside Nuxt via `container_images/firn-entrypoint.sh` (with `dumb-init` as
PID 1 for signal forwarding and zombie reaping). Meilisearch binds to
`127.0.0.1:7700` **only** and is never published; its index lives in the
dedicated `ngi_firn_meili_data` volume mounted at `/data/meili`.
Both images require `MEILISEARCH_API_KEY` in their runtime environment.

The pinned version is `MEILISEARCH_VERSION` in both Dockerfiles and the CI
workflow — keep them in sync. **Verify the release and its checksum** against
<https://github.com/meilisearch/meilisearch/releases> before bumping; supply
`MEILISEARCH_SHA256` as a build arg to the production image to enforce it.

The production container listens on port **3001** (see `EXPOSE`/`PORT`/health
check); Compose maps host `3000:3001` for the staging profiles. The development
image listens on **3000**.

### CI

`.github/workflows/integration-tests.yml` downloads the pinned binary and starts
it on loopback with a disposable master key and the `firn_ci` index prefix, so
search-backed integration tests run without any external service or secret.

## Boundaries

- Explicit project membership only — associations are never inherited from a
  parent container.
- Sample-level data, delivery paths, tokens and arbitrary document properties
  are never indexed. Project comments/names are searchable only behind the same
  approved-user access as the rest of the app.
