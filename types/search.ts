/*
 * Search contracts for the global inventory search feature.
 *
 * Two distinct shapes live here:
 *
 *  1. Internal index projections (`*IndexDocument`) — the server-only documents pushed into
 *     Meilisearch. They are derived, denormalized representations, NOT authoritative CouchDB
 *     documents, so they intentionally carry no `_rev`/`schema` and never embed raw document
 *     blobs, audit logs or sample-level data.
 *
 *  2. Client-safe response DTOs (`Search*Hit`, `*SearchResponse`, `SearchIndexStatus`) — the
 *     only shapes that cross the tRPC boundary to the browser. They expose public slugs and
 *     ready-made detail URLs, never internal CouchDB `_id`s or engine credentials.
 *
 * The four searchable entity kinds mirror the existing inventory taxonomy; shelves and racks
 * are containers and do not add a kind.
 */

export type SearchEntityKind = 'room' | 'equipment' | 'container' | 'item'

/* ------------------------------------------------------------------ */
/* Internal index projections (server-only)                            */
/* ------------------------------------------------------------------ */

/*
 * One inventory entity as indexed in Meilisearch. `id` is a search-safe primary key
 * (Meilisearch keys allow only `A-Z a-z 0-9 - _`); `sourceId` keeps the CouchDB `_id` for
 * server-side reconciliation and is never returned to the client.
 */
export type InventoryIndexDocument = {
  id: string
  sourceId: string
  kind: SearchEntityKind
  slug: string
  name: string
  label: string | null
  barcode: string | null
  description: string | null
  notes: string | null
  classification: string | null
  /* Raw subtype discriminator: roomType / equipmentType / containerType / item category. */
  subtype: string | null
  lotNumber: string | null
  serialNumber: string | null
  /* Lifecycle status for containers/items; null for rooms/equipment, which use `isActive`. */
  status: string | null
  isActive: boolean | null
  /* Human-readable ancestry (room → equipment → container …) for breadcrumbs and filtering. */
  locationPath: string[]
  locationSlugs: string[]
  roomSlug: string | null
  parentSlug: string | null
  parentKind: SearchEntityKind | null
  /* Explicit project membership only — never inherited from a parent container. */
  projectIds: string[]
  projectDocIds: string[]
  updatedAt: string
  /* Epoch milliseconds mirror of `updatedAt`, used as a Meilisearch sortable attribute. */
  updatedAtTs: number
}

/*
 * One project as indexed in Meilisearch. Only projects with at least one explicit inventory
 * link are indexed. `comments` concatenates the allowlisted free-text comment fields; sample
 * data, delivery paths and arbitrary document properties are deliberately excluded.
 */
export type LinkedProjectIndexDocument = {
  id: string
  docId: string
  projectId: string
  projectName: string
  application: string | null
  affiliation: string | null
  status: string | null
  referenceGenome: string | null
  organism: string | null
  projectDescription: string | null
  customerReference: string | null
  contact: string | null
  coordinator: string | null
  labResponsible: string | null
  bioinfoResponsible: string | null
  comments: string | null
  /* Distinct linked inventory records; drives group eligibility and ordering. */
  linkedCount: number
}

/*
 * One project as indexed in the project *catalog* index that backs `/projects`. Unlike
 * `LinkedProjectIndexDocument` (link-scoped, inventory search only), the catalog contains every project in
 * the projects database. Built from the `project/summary` view row; no sample-level data, delivery
 * paths or arbitrary document properties.
 */
export type ProjectCatalogIndexDocument = {
  id: string
  docId: string
  projectId: string
  projectName: string
  /* Derived exactly like the `project/summary` view key: open iff LIMS-sourced without close_date. */
  status: 'open' | 'closed'
  application: string | null
  affiliation: string | null
  organism: string | null
  referenceGenome: string | null
  projectDescription: string | null
  customerReference: string | null
  contact: string | null
  coordinator: string | null
  labResponsible: string | null
  bioinfoResponsible: string | null
  priority: string | null
  comments: string | null
  noSamples: number | null
  openDate: string | null
  closeDate: string | null
  modificationTime: string | null
  /* Epoch-millisecond mirrors used as sortable attributes (0 when absent). */
  openDateTs: number
  modificationTs: number
}

/* ------------------------------------------------------------------ */
/* Client-safe response DTOs                                           */
/* ------------------------------------------------------------------ */

export interface SearchInventoryHit {
  id: string
  kind: SearchEntityKind
  slug: string
  name: string
  label: string | null
  barcode: string | null
  description: string | null
  classification: string | null
  subtype: string | null
  status: string | null
  isActive: boolean | null
  locationPath: string[]
  roomSlug: string | null
  parentSlug: string | null
  parentKind: SearchEntityKind | null
  projectIds: string[]
  /* Pre-computed route to the entity's detail/contents page. */
  detailUrl: string
}

export interface SearchProjectHit {
  projectId: string
  projectName: string
  application: string | null
  affiliation: string | null
  status: string | null
  referenceGenome: string | null
  organism: string | null
  projectDescription: string | null
  customerReference: string | null
  contact: string | null
  coordinator: string | null
  labResponsible: string | null
  bioinfoResponsible: string | null
  linkedCount: number
  detailUrl: string
}

/* A bounded, independently paginated window of inventory hits. */
export interface SearchInventoryPage {
  hits: SearchInventoryHit[]
  total: number
  /* Meilisearch returns an estimated total hit count beyond its window; surface that honestly. */
  totalIsEstimated: boolean
  offset: number
  limit: number
  hasMore: boolean
}

/* A matching project together with the current page of its explicitly linked inventory. */
export interface SearchProjectGroup {
  project: SearchProjectHit
  inventory: SearchInventoryPage
}

export interface SearchProjectGroupPage {
  groups: SearchProjectGroup[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

export type SearchIndexPhase = 'initializing' | 'ready' | 'stale' | 'unavailable'/*
 * Freshness/availability of the search indexes. `phase` is the overall health; the booleans
 * disambiguate partial availability (e.g. inventory ready but the optional projects database
 * unreachable). Never represented as empty results — the UI must show this state explicitly.
 */
export interface SearchIndexStatus {
  phase: SearchIndexPhase
  inventoryReady: boolean
  projectsReady: boolean
  projectsConfigured: boolean
  /* The all-projects catalog index backing `/projects` is built and servable. */
  catalogReady: boolean
  catalogLastSyncedAt: string | null
  lastSyncedAt: string | null
  /* Timestamp of the last successful full rebuild (null until the first one completes). */
  lastRebuiltAt: string | null
  message: string | null
}

/*
 * Result of an admin-triggered manual rebuild. The rebuild runs detached in the background, so
 * this only reports whether the request was accepted or a rebuild was already in progress; the
 * admin page then polls `status` to watch it complete.
 */
export interface SearchRebuildResult {
  status: 'accepted' | 'already-running' | 'unavailable'
  freshness: SearchIndexStatus
}

/*
 * The full search response. Two sections, each independently paginated:
 *  - `projectGroups`: projects whose own metadata matched, each exposing their linked inventory
 *    (subject to the selected inventory filters) even when the item text does not match.
 *  - `directMatches`: inventory whose own text matched. `projectLookup` resolves the project IDs
 *    carried on each hit to names so the client can group the current page by project (and an
 *    unlinked group) without another round trip.
 */
export interface InventorySearchResponse {
  query: string
  projectGroups: SearchProjectGroupPage
  directMatches: SearchInventoryPage
  projectLookup: Record<string, { projectName: string, detailUrl: string }>
  freshness: SearchIndexStatus
}
