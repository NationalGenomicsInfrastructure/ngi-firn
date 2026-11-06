/*
 * Search index lifecycle: bootstrap rebuild, atomic swap, and incremental _changes sync.
 *
 * Correctness model:
 *  - `rebuildAll()` is the authoritative reconciler. It captures the CouchDB update sequence
 *    *before* reading documents (so any mutation racing the read is simply reprocessed later —
 *    all writes are idempotent upserts keyed by id), builds fresh shadow indexes, and swaps them
 *    into place atomically. It also fully rebuilds the project index and refreshes `lastSeq`.
 *  - `syncInventoryChanges()` is a lightweight steady-state pass that applies inventory
 *    upserts/deletes from the _changes feed between rebuilds, advancing `lastSeq`. Project
 *    grouping/linkedCount drift (e.g. a brand-new project link) is reconciled at the next
 *    `rebuildAll()`, which the Nitro plugin schedules periodically.
 *
 * Every engine interaction is guarded so a missing/unavailable Meilisearch host never throws into
 * request handling — it only flips the reported search state.
 */

import type { CloudantV1 } from '@ibm-cloud/cloudant'
import type { Meilisearch, Settings } from 'meilisearch'
import { couchDB } from '../database/couchdb'
import { PROJECTS_DB_NAME, ProjectService } from '../crud/projects.server'
import type { ProjectsDbDocument } from '../../types/projects'
import type { InventoryIndexDocument, ProjectCatalogIndexDocument, LinkedProjectIndexDocument } from '../../types/search'
import { ensureProjectsViews } from '../crud/views'
import { getSearchClient } from './client'
import {
  CATALOG_FILTERABLE_ATTRIBUTES,
  CATALOG_MAX_TOTAL_HITS,
  CATALOG_MAX_VALUES_PER_FACET,
  CATALOG_SEARCHABLE_ATTRIBUTES,
  CATALOG_SORTABLE_ATTRIBUTES,
  INVENTORY_FILTERABLE_ATTRIBUTES,
  INVENTORY_SEARCHABLE_ATTRIBUTES,
  INVENTORY_SORTABLE_ATTRIBUTES,
  LINKED_PROJECT_FILTERABLE_ATTRIBUTES,
  LINKED_PROJECT_SEARCHABLE_ATTRIBUTES,
  LINKED_PROJECT_SORTABLE_ATTRIBUTES,
  SEARCH_PRIMARY_KEY,
  SHADOW_INDEX_SUFFIX,
  inventoryIndexName,
  isSearchConfigured,
  projectCatalogIndexName,
  linkedProjectIndexName
} from './config'
import {
  makeSearchSafeId,
  toInventoryIndexDocument,
  toProjectCatalogDocument,
  toLinkedProjectIndexDocument,
  type StoredInventoryDoc
} from './projections'
import {
  beginCatalogSync,
  beginRebuild,
  beginSync,
  endCatalogSync,
  endRebuild,
  endSync,
  getLastProjectsSeq,
  getLastSeq,
  markCatalogReady,
  markCatalogUnavailable,
  markReady,
  markStale,
  markUnavailable,
  setLastProjectsSeq,
  setLastSeq,
  touchCatalogSynced,
  touchSynced
} from './state'

const INVENTORY_DOC_TYPES = new Set(['room', 'storageEquipment', 'container', 'inventoryItem'])
const INDEXING_BATCH_SIZE = 1000
const TASK_TIMEOUT_MS = 120_000

function isInventoryDoc(doc: { type?: string } | null | undefined): doc is StoredInventoryDoc {
  return !!doc && typeof doc.type === 'string' && INVENTORY_DOC_TYPES.has(doc.type)
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

const INVENTORY_SETTINGS: Settings = {
  searchableAttributes: INVENTORY_SEARCHABLE_ATTRIBUTES,
  filterableAttributes: INVENTORY_FILTERABLE_ATTRIBUTES,
  sortableAttributes: INVENTORY_SORTABLE_ATTRIBUTES
}

const LINKED_PROJECT_SETTINGS: Settings = {
  searchableAttributes: LINKED_PROJECT_SEARCHABLE_ATTRIBUTES,
  filterableAttributes: LINKED_PROJECT_FILTERABLE_ATTRIBUTES,
  sortableAttributes: LINKED_PROJECT_SORTABLE_ATTRIBUTES
}

/*
 * Catalog settings. `projectId` has typo tolerance disabled so P12345 never fuzzy-matches P12346
 * (prefix matching on the last query word still lets "P123" find P12345). `_` and `.` split project
 * names such as "P.Långstrump_45_11" into separate tokens.
 */
const CATALOG_SETTINGS: Settings = {
  searchableAttributes: CATALOG_SEARCHABLE_ATTRIBUTES,
  filterableAttributes: CATALOG_FILTERABLE_ATTRIBUTES,
  sortableAttributes: CATALOG_SORTABLE_ATTRIBUTES,
  typoTolerance: { disableOnAttributes: ['projectId'] },
  separatorTokens: ['_', '.'],
  pagination: { maxTotalHits: CATALOG_MAX_TOTAL_HITS },
  faceting: { maxValuesPerFacet: CATALOG_MAX_VALUES_PER_FACET, sortFacetValuesBy: { '*': 'alpha' } }
}

async function ensureIndex(client: Meilisearch, name: string): Promise<void> {
  try {
    await client.getIndex(name)
  }
  catch {
    await client.createIndex(name, { primaryKey: SEARCH_PRIMARY_KEY }).waitTask({ timeout: TASK_TIMEOUT_MS })
  }
}

/*
 * Drop an index only if it exists, awaiting the delete task to completion.
 *
 * `client.deleteIndexIfExists()` enqueues an unconditional delete and only awaits the *enqueue*,
 * so when the index is absent (e.g. the shadow on the first rebuild) Meilisearch accepts the task
 * and then fails it during processing — logging a noisy "Index not found" ERROR. Checking first
 * with `getIndex` (a plain GET, not a task) avoids that, and waiting for the delete task prevents
 * a pending delete from racing the subsequent create of the same uid.
 */
async function dropIndexIfExists(client: Meilisearch, name: string): Promise<void> {
  try {
    await client.getIndex(name)
  }
  catch {
    return
  }
  await client.deleteIndex(name).waitTask({ timeout: TASK_TIMEOUT_MS })
}

/*
 * Build a fresh shadow index from scratch and atomically swap it in for the live index, then
 * drop the shadow. Swapping two indexes is Meilisearch's supported way to replace a dataset with
 * zero windows of partial/empty results for searchers.
 */
async function rebuildIndexWithSwap<T extends Record<string, unknown>>(
  client: Meilisearch,
  name: string,
  settings: Settings,
  documents: T[]
): Promise<void> {
  const shadowName = `${name}${SHADOW_INDEX_SUFFIX}`

  await dropIndexIfExists(client, shadowName)
  await client.createIndex(shadowName, { primaryKey: SEARCH_PRIMARY_KEY }).waitTask({ timeout: TASK_TIMEOUT_MS })

  const shadow = client.index<T>(shadowName)
  await shadow.updateSettings(settings).waitTask({ timeout: TASK_TIMEOUT_MS })

  for (const batch of chunk(documents, INDEXING_BATCH_SIZE)) {
    await shadow.addDocuments(batch).waitTask({ timeout: TASK_TIMEOUT_MS })
  }

  /* The live index must exist for the swap to have two operands. */
  await ensureIndex(client, name)
  await client.swapIndexes([{ indexes: [name, shadowName], rename: false }]).waitTask({ timeout: TASK_TIMEOUT_MS })
  await dropIndexIfExists(client, shadowName)
}

interface InventoryProjection {
  indexDocuments: InventoryIndexDocument[]
  /* project document _id -> number of distinct inventory records linking it */
  linkCountByProjectDocId: Map<string, number>
}

function projectAllInventory(docs: StoredInventoryDoc[]): InventoryProjection {
  const byId = new Map<string, StoredInventoryDoc>()
  for (const doc of docs) {
    byId.set(doc._id, doc)
  }
  const resolveParent = (id: string) => byId.get(id)

  const indexDocuments: InventoryIndexDocument[] = []
  const linkCountByProjectDocId = new Map<string, number>()

  for (const doc of docs) {
    const projected = toInventoryIndexDocument(doc, resolveParent)
    if (!projected) {
      continue
    }
    indexDocuments.push(projected)
    for (const projectDocId of projected.projectDocIds) {
      linkCountByProjectDocId.set(projectDocId, (linkCountByProjectDocId.get(projectDocId) ?? 0) + 1)
    }
  }

  return { indexDocuments, linkCountByProjectDocId }
}

async function buildLinkedProjectIndexDocuments(
  linkCountByProjectDocId: Map<string, number>
): Promise<{ documents: LinkedProjectIndexDocument[], available: boolean }> {
  const projectDocIds = [...linkCountByProjectDocId.keys()]
  if (projectDocIds.length === 0) {
    /* No links at all: treat projects as available only if the DB is reachable. */
    const available = await ProjectService.isProjectsAvailable()
    return { documents: [], available }
  }

  if (!(await ProjectService.isProjectsAvailable())) {
    return { documents: [], available: false }
  }

  const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)
  const fetched = await projectsDB.getDocumentsByIds<ProjectsDbDocument>(projectDocIds)

  const documents: LinkedProjectIndexDocument[] = []
  for (const doc of fetched) {
    if (!doc || typeof doc.project_id !== 'string' || typeof doc.project_name !== 'string') {
      continue
    }
    documents.push(toLinkedProjectIndexDocument(doc, linkCountByProjectDocId.get(doc._id) ?? 0))
  }

  return { documents, available: true }
}

/* Authoritative full rebuild of both indexes with atomic swap. */
export async function rebuildAll(): Promise<void> {
  if (!isSearchConfigured()) {
    markUnavailable('Search engine is not configured (MEILISEARCH_HOST unset).')
    return
  }
  const client = getSearchClient()
  if (!client) {
    markUnavailable('Search engine client could not be created.')
    return
  }
  if (!beginRebuild()) {
    return
  }

  try {
    /* Capture the sequence BEFORE the read so racing writes are reprocessed, never lost. */
    const dbInfo = await couchDB.getDatabaseInformation()
    const capturedSeq = dbInfo?.updateSeq ?? null

    const allDocs = await couchDB.getAllDocuments<CloudantV1.Document & { type?: string }>()
    const inventoryDocs = allDocs.filter(isInventoryDoc)

    const { indexDocuments, linkCountByProjectDocId } = projectAllInventory(inventoryDocs)
    const { documents: projectDocuments, available: projectsReady } = await buildLinkedProjectIndexDocuments(linkCountByProjectDocId)

    await rebuildIndexWithSwap(client, inventoryIndexName(), INVENTORY_SETTINGS, indexDocuments)
    if (projectsReady) {
      await rebuildIndexWithSwap(client, linkedProjectIndexName(), LINKED_PROJECT_SETTINGS, projectDocuments)
    }

    markReady({ projectsConfigured: projectsReady, projectsReady, lastSeq: capturedSeq })
    console.log(
      `🔎 Search index rebuilt: ${indexDocuments.length} inventory, ${projectDocuments.length} project document(s)`
      + `${projectsReady ? '' : ' (projects database unavailable)'}`
    )

    /* The /projects catalog is independent: its failure must never degrade inventory search. */
    await rebuildProjectCatalog(client)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markStale(`Search index rebuild failed: ${message}`)
    console.error('Search index rebuild failed:', error)
  }
  finally {
    endRebuild()
  }
}

/*
 * Full rebuild of the all-projects catalog index (backs `/projects`).
 *
 * Reads the `project/summary` view page by page WITHOUT include_docs: rows are sample-free, whereas
 * full project documents embed every sample and are far too large to bulk-load. Only the small
 * projected documents are accumulated in memory. The projects-DB update sequence is captured before
 * reading so racing edits are re-applied by the next incremental sync. Never throws.
 */
async function rebuildProjectCatalog(client: Meilisearch): Promise<void> {
  try {
    const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)
    const info = await projectsDB.getDatabaseInformation()
    if (!info) {
      markCatalogUnavailable()
      return
    }
    const capturedSeq = info.updateSeq ?? null

    /* Make sure the app-owned helper views exist (soft-fails when the DB cannot be written). */
    await ensureProjectsViews()

    const documents: ProjectCatalogIndexDocument[] = []
    for (const status of ['open', 'closed'] as const) {
      for await (const rows of ProjectService.summaryRowPages(status)) {
        for (const row of rows) {
          const projected = toProjectCatalogDocument({ id: row.id ?? '', key: row.key, value: row.value })
          if (projected) {
            documents.push(projected)
          }
        }
      }
    }

    await rebuildIndexWithSwap(client, projectCatalogIndexName(), CATALOG_SETTINGS, documents)
    markCatalogReady(capturedSeq)
    console.log(`🔎 Project catalog rebuilt: ${documents.length} project(s)`)
  }
  catch (error) {
    /* Keep a previously built catalog servable; just report the failure. */
    console.error('Project catalog rebuild failed:', error)
  }
}

let warnedMissingCatalogView = false

/*
 * Incremental catalog sync from the projects DB `_changes` feed (its own cursor, separate from the
 * inventory one). The feed is read WITHOUT docs; changed document ids are resolved to current
 * summary rows via the `firn-projects/doc_project_ids` helper view. Ids that no longer resolve to a
 * project (deleted) are removed from the index. If the helper view is missing, the cursor is left
 * untouched and the next full rebuild reconciles.
 */
export async function syncProjectCatalogChanges(): Promise<void> {
  if (!isSearchConfigured()) {
    return
  }
  const client = getSearchClient()
  const since = getLastProjectsSeq()
  if (!client || since === null) {
    return
  }
  if (!beginCatalogSync()) {
    return
  }

  try {
    const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)
    const catalogIdx = client.index<ProjectCatalogIndexDocument>(projectCatalogIndexName())

    let cursor = since
    for (let page = 0; page < 50; page++) {
      const changes = await projectsDB.getChanges<CloudantV1.Document>({ since: cursor, limit: 500, includeDocs: false })

      const deletions = new Set<string>()
      const changedDocIds = new Set<string>()
      for (const change of changes.results) {
        if (change.id.startsWith('_design/')) {
          continue
        }
        if (change.deleted) {
          deletions.add(makeSearchSafeId(change.id))
        }
        else {
          changedDocIds.add(change.id)
        }
      }

      const upserts: ProjectCatalogIndexDocument[] = []
      if (changedDocIds.size > 0) {
        const resolved = await ProjectService.getSummaryRowsByDocIds([...changedDocIds])
        if (!resolved) {
          if (!warnedMissingCatalogView) {
            warnedMissingCatalogView = true
            console.warn('Project catalog sync paused: _design/firn-projects/doc_project_ids is unavailable. The next full rebuild will reconcile.')
          }
          return
        }
        warnedMissingCatalogView = false
        for (const row of resolved.rows) {
          const projected = toProjectCatalogDocument({ id: row.id ?? '', key: row.key, value: row.value })
          if (projected) {
            upserts.push(projected)
          }
        }
        for (const missing of resolved.missingDocIds) {
          deletions.add(makeSearchSafeId(missing))
        }
      }

      if (deletions.size > 0) {
        await catalogIdx.deleteDocuments([...deletions]).waitTask({ timeout: TASK_TIMEOUT_MS })
      }
      for (const batch of chunk(upserts, INDEXING_BATCH_SIZE)) {
        await catalogIdx.addDocuments(batch).waitTask({ timeout: TASK_TIMEOUT_MS })
      }

      cursor = changes.lastSeq
      setLastProjectsSeq(cursor)
      if (changes.results.length === 0 || changes.pending === 0) {
        break
      }
    }

    touchCatalogSynced()
  }
  catch (error) {
    console.error('Project catalog incremental sync failed:', error)
  }
  finally {
    endCatalogSync()
  }
}

/* Incremental steady-state inventory sync from the _changes feed. */
export async function syncInventoryChanges(): Promise<void> {
  if (!isSearchConfigured()) {
    return
  }
  const client = getSearchClient()
  const since = getLastSeq()
  if (!client || since === null) {
    /* Not bootstrapped yet; a rebuild must run first to establish the cursor. */
    return
  }
  if (!beginSync()) {
    return
  }

  try {
    const inventoryIdx = client.index<InventoryIndexDocument>(inventoryIndexName())

    let cursor = since
    /* Drain the feed in bounded pages so a long outage catches up without unbounded memory. */
    for (let page = 0; page < 50; page++) {
      const changes = await couchDB.getChanges<CloudantV1.Document & { type?: string }>({
        since: cursor,
        limit: 2000,
        includeDocs: true
      })

      const upserts: InventoryIndexDocument[] = []
      const deletions: string[] = []
      /* Parent lookups for location ancestry are fetched lazily and cached per page. */
      const parentCache = new Map<string, StoredInventoryDoc | undefined>()

      for (const change of changes.results) {
        if (change.deleted) {
          deletions.push(makeSearchSafeId(change.id))
          continue
        }
        const doc = change.doc
        if (!isInventoryDoc(doc)) {
          continue
        }
        const projected = await projectInventoryWithLookup(doc, parentCache)
        if (projected) {
          upserts.push(projected)
        }
      }

      if (deletions.length > 0) {
        await inventoryIdx.deleteDocuments(deletions).waitTask({ timeout: TASK_TIMEOUT_MS })
      }
      if (upserts.length > 0) {
        for (const batch of chunk(upserts, INDEXING_BATCH_SIZE)) {
          await inventoryIdx.addDocuments(batch).waitTask({ timeout: TASK_TIMEOUT_MS })
        }
      }

      cursor = changes.lastSeq
      setLastSeq(cursor)
      if (changes.results.length === 0 || changes.pending === 0) {
        break
      }
    }

    touchSynced()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markStale(`Search incremental sync failed: ${message}`)
    console.error('Search incremental sync failed:', error)
  }
  finally {
    endSync()
  }
}

/*
 * Project a changed inventory document, pre-warming its ancestor chain into the shared cache so
 * the synchronous projection can read location ancestry.
 */
async function projectInventoryWithLookup(
  doc: StoredInventoryDoc,
  cache: Map<string, StoredInventoryDoc | undefined>
): Promise<InventoryIndexDocument | null> {
  /* Pre-fetch the ancestor chain (bounded depth) so the synchronous projection can read it. */
  await prefetchAncestors(doc, cache)
  return toInventoryIndexDocument(doc, id => cache.get(id))
}

async function prefetchAncestors(
  doc: StoredInventoryDoc,
  cache: Map<string, StoredInventoryDoc | undefined>
): Promise<void> {
  let current: StoredInventoryDoc | undefined = doc
  const visited = new Set<string>([doc._id])

  for (let depth = 0; depth < 12 && current; depth++) {
    const parentId = current.type === 'room' ? null : current.parent?.id ?? null
    if (!parentId || visited.has(parentId)) {
      return
    }
    visited.add(parentId)

    if (!cache.has(parentId)) {
      const [fetched] = await couchDB.getDocumentsByIds<CloudantV1.Document & { type?: string }>([parentId])
      cache.set(parentId, isInventoryDoc(fetched) ? fetched : undefined)
    }
    current = cache.get(parentId)
  }
}
