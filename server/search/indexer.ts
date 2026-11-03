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
import type { InventoryIndexDocument, ProjectIndexDocument } from '../../types/search'
import { getSearchClient } from './client'
import {
  INVENTORY_FILTERABLE_ATTRIBUTES,
  INVENTORY_SEARCHABLE_ATTRIBUTES,
  INVENTORY_SORTABLE_ATTRIBUTES,
  PROJECT_FILTERABLE_ATTRIBUTES,
  PROJECT_SEARCHABLE_ATTRIBUTES,
  PROJECT_SORTABLE_ATTRIBUTES,
  SEARCH_PRIMARY_KEY,
  SHADOW_INDEX_SUFFIX,
  inventoryIndexName,
  isSearchConfigured,
  projectIndexName
} from './config'
import {
  makeSearchSafeId,
  toInventoryIndexDocument,
  toProjectIndexDocument,
  type StoredInventoryDoc
} from './projections'
import {
  beginRebuild,
  beginSync,
  endRebuild,
  endSync,
  getLastSeq,
  markReady,
  markStale,
  markUnavailable,
  setLastSeq,
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

const PROJECT_SETTINGS: Settings = {
  searchableAttributes: PROJECT_SEARCHABLE_ATTRIBUTES,
  filterableAttributes: PROJECT_FILTERABLE_ATTRIBUTES,
  sortableAttributes: PROJECT_SORTABLE_ATTRIBUTES
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

  await client.deleteIndexIfExists(shadowName)
  await client.createIndex(shadowName, { primaryKey: SEARCH_PRIMARY_KEY }).waitTask({ timeout: TASK_TIMEOUT_MS })

  const shadow = client.index<T>(shadowName)
  await shadow.updateSettings(settings).waitTask({ timeout: TASK_TIMEOUT_MS })

  for (const batch of chunk(documents, INDEXING_BATCH_SIZE)) {
    await shadow.addDocuments(batch).waitTask({ timeout: TASK_TIMEOUT_MS })
  }

  /* The live index must exist for the swap to have two operands. */
  await ensureIndex(client, name)
  await client.swapIndexes([{ indexes: [name, shadowName], rename: false }]).waitTask({ timeout: TASK_TIMEOUT_MS })
  await client.deleteIndexIfExists(shadowName)
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

async function buildProjectIndexDocuments(
  linkCountByProjectDocId: Map<string, number>
): Promise<{ documents: ProjectIndexDocument[], available: boolean }> {
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

  const documents: ProjectIndexDocument[] = []
  for (const doc of fetched) {
    if (!doc || typeof doc.project_id !== 'string' || typeof doc.project_name !== 'string') {
      continue
    }
    documents.push(toProjectIndexDocument(doc, linkCountByProjectDocId.get(doc._id) ?? 0))
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
    const { documents: projectDocuments, available: projectsReady } = await buildProjectIndexDocuments(linkCountByProjectDocId)

    await rebuildIndexWithSwap(client, inventoryIndexName(), INVENTORY_SETTINGS, indexDocuments)
    if (projectsReady) {
      await rebuildIndexWithSwap(client, projectIndexName(), PROJECT_SETTINGS, projectDocuments)
    }

    markReady({ projectsConfigured: projectsReady, projectsReady, lastSeq: capturedSeq })
    console.log(
      `🔎 Search index rebuilt: ${indexDocuments.length} inventory, ${projectDocuments.length} project document(s)`
      + `${projectsReady ? '' : ' (projects database unavailable)'}`
    )
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
