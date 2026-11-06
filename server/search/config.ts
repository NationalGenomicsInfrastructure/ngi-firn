/*
 * Static configuration for the Meilisearch-backed global inventory search.
 *
 * The search engine is optional: when `MEILISEARCH_HOST` is unset the whole feature degrades
 * gracefully (the indexer never starts and the search service reports an `unavailable` status
 * instead of throwing). Index names are scoped by both a deployment prefix and the active
 * application database so that dev / test / prod — and in particular the disposable integration
 * test database — never share or clobber each other's indexes on a shared engine.
 */

export interface SearchEngineConfig {
  host: string
  apiKey: string | undefined
}

/* True when a Meilisearch host is configured and the feature should be active. */
export function isSearchConfigured(): boolean {
  return !!process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_HOST.trim().length > 0
}

/* Resolve the engine connection from the environment, or null when unconfigured. */
export function getSearchEngineConfig(): SearchEngineConfig | null {
  const host = process.env.MEILISEARCH_HOST?.trim()
  if (!host) {
    return null
  }
  return {
    host,
    apiKey: process.env.MEILISEARCH_API_KEY?.trim() || undefined
  }
}

/* Meilisearch index uids allow only `A-Z a-z 0-9 _ -`; collapse everything else to `-`. */
function sanitizeIndexPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'firn'
}

function indexScope(): string {
  const prefix = sanitizeIndexPart(process.env.MEILISEARCH_INDEX_PREFIX || 'firn')
  const db = sanitizeIndexPart(process.env.CLOUDANT_DATABASE || 'firn')
  return `${prefix}__${db}`
}

export function inventoryIndexName(): string {
  return `${indexScope()}__inventory`
}

/* Only projects with at least one explicit inventory link; serves the inventory search's project groups. */
export function linkedProjectIndexName(): string {
  return `${indexScope()}__linked_projects`
}

/* All-projects catalog backing `/projects` (distinct from the link-scoped `linked_projects` index above). */
export function projectCatalogIndexName(): string {
  return `${indexScope()}__project_catalog`
}

/* Suffix used for the transient shadow index built during an atomic rebuild+swap. */
export const SHADOW_INDEX_SUFFIX = '__shadow'

/* Primary key field shared by both index document shapes. */
export const SEARCH_PRIMARY_KEY = 'id'

/* Intervals (ms) for the background indexer loop. Overridable for tests/tuning via env. */
export function incrementalSyncIntervalMs(): number {
  const parsed = Number(process.env.MEILISEARCH_SYNC_INTERVAL_MS)
  return Number.isFinite(parsed) && parsed >= 2000 ? parsed : 30_000
}

/*
 * Full rebuild interval (ms). Inventory changes are infrequent and the incremental _changes sync
 * keeps the index fresh between rebuilds, so the periodic full rebuild — which only reconciles
 * project grouping and prunes deletions — runs rarely (default 24h). Admins can force an immediate
 * rebuild from the search maintenance page. Overridable via env (minimum 1 minute).
 */
export function fullRebuildIntervalMs(): number {
  const parsed = Number(process.env.MEILISEARCH_REBUILD_INTERVAL_MS)
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 86_400_000
}

/* ------------------------------------------------------------------ */
/* Index settings                                                      */
/* ------------------------------------------------------------------ */

export const INVENTORY_SEARCHABLE_ATTRIBUTES = [
  'name',
  'label',
  'barcode',
  'serialNumber',
  'lotNumber',
  'classification',
  'subtype',
  'description',
  'notes',
  'locationPath',
  'slug'
]

export const INVENTORY_FILTERABLE_ATTRIBUTES = [
  'kind',
  'status',
  'classification',
  'roomSlug',
  'projectIds',
  'projectDocIds'
]

export const INVENTORY_SORTABLE_ATTRIBUTES = ['updatedAtTs', 'name']

export const LINKED_PROJECT_SEARCHABLE_ATTRIBUTES = [
  'projectId',
  'projectName',
  'application',
  'affiliation',
  'status',
  'referenceGenome',
  'organism',
  'customerReference',
  'contact',
  'coordinator',
  'labResponsible',
  'bioinfoResponsible',
  'projectDescription',
  'comments'
]

export const LINKED_PROJECT_FILTERABLE_ATTRIBUTES = ['projectId', 'docId', 'status']

export const LINKED_PROJECT_SORTABLE_ATTRIBUTES = ['linkedCount', 'projectName']

/* ------------------------------------------------------------------ */
/* Project catalog index settings (`/projects`)                         */
/* ------------------------------------------------------------------ */

/* Order matters: Meilisearch ranks earlier attributes higher. */
export const CATALOG_SEARCHABLE_ATTRIBUTES = [
  'projectId',
  'projectName',
  'application',
  'organism',
  'affiliation',
  'contact',
  'coordinator',
  'labResponsible',
  'bioinfoResponsible',
  'customerReference',
  'referenceGenome',
  'projectDescription',
  'comments'
]

export const CATALOG_FILTERABLE_ATTRIBUTES = [
  'status',
  'application',
  'affiliation',
  'priority',
  'coordinator',
  'labResponsible',
  'bioinfoResponsible'
]

export const CATALOG_SORTABLE_ATTRIBUTES = ['modificationTs', 'openDateTs', 'projectId', 'noSamples']

/* Upper bound for reachable hits (Meilisearch defaults to 1000) and distinct facet values. */
export const CATALOG_MAX_TOTAL_HITS = 20_000
export const CATALOG_MAX_VALUES_PER_FACET = 5000
