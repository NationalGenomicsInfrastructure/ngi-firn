/*
 * In-memory search index state (single Nitro worker).
 *
 * Holds both the publicly reportable freshness/availability (`SearchIndexStatus`, surfaced to the
 * client so the UI can distinguish "no results" from "index not ready / engine down") and the
 * private bookkeeping the indexer needs between runs (`lastSeq` cursor into the CouchDB _changes
 * feed, and re-entrancy guards so overlapping timers never run two rebuilds concurrently).
 */

import type { SearchIndexPhase, SearchIndexStatus } from '../../types/search'

interface InternalSearchState {
  phase: SearchIndexPhase
  inventoryReady: boolean
  projectsReady: boolean
  projectsConfigured: boolean
  catalogReady: boolean
  catalogLastSyncedAt: string | null
  lastSyncedAt: string | null
  lastRebuiltAt: string | null
  message: string | null
  /* CouchDB update sequence already reflected in the inventory index. */
  lastSeq: string | null
  /* Projects-DB update sequence already reflected in the project catalog index. */
  lastProjectsSeq: string | null
  rebuilding: boolean
  syncing: boolean
  syncingCatalog: boolean
}

const state: InternalSearchState = {
  phase: 'initializing',
  inventoryReady: false,
  projectsReady: false,
  projectsConfigured: false,
  catalogReady: false,
  catalogLastSyncedAt: null,
  lastSyncedAt: null,
  lastRebuiltAt: null,
  message: null,
  lastSeq: null,
  lastProjectsSeq: null,
  rebuilding: false,
  syncing: false,
  syncingCatalog: false
}

export function getSearchState(): SearchIndexStatus {
  return {
    phase: state.phase,
    inventoryReady: state.inventoryReady,
    projectsReady: state.projectsReady,
    projectsConfigured: state.projectsConfigured,
    catalogReady: state.catalogReady,
    catalogLastSyncedAt: state.catalogLastSyncedAt,
    lastSyncedAt: state.lastSyncedAt,
    lastRebuiltAt: state.lastRebuiltAt,
    message: state.message
  }
}

export function getLastSeq(): string | null {
  return state.lastSeq
}

export function setLastSeq(seq: string | null): void {
  state.lastSeq = seq
}

export function getLastProjectsSeq(): string | null {
  return state.lastProjectsSeq
}

export function setLastProjectsSeq(seq: string | null): void {
  state.lastProjectsSeq = seq
}

/* Catalog (all-projects) index bookkeeping; independent of the inventory index health. */
export function markCatalogReady(lastProjectsSeq: string | null): void {
  state.catalogReady = true
  state.lastProjectsSeq = lastProjectsSeq
  state.catalogLastSyncedAt = new Date().toISOString()
}

export function markCatalogUnavailable(): void {
  state.catalogReady = false
}

export function touchCatalogSynced(): void {
  state.catalogLastSyncedAt = new Date().toISOString()
}

export function beginCatalogSync(): boolean {
  if (state.syncingCatalog || state.rebuilding) {
    return false
  }
  state.syncingCatalog = true
  return true
}

export function endCatalogSync(): void {
  state.syncingCatalog = false
}

export function markUnavailable(message: string): void {
  state.phase = 'unavailable'
  state.inventoryReady = false
  state.projectsReady = false
  state.catalogReady = false
  state.message = message
}

export function markInitializing(): void {
  state.phase = 'initializing'
  state.message = null
}

export function markReady(partial: {
  projectsConfigured: boolean
  projectsReady: boolean
  lastSeq: string | null
}): void {
  state.phase = 'ready'
  state.inventoryReady = true
  state.projectsConfigured = partial.projectsConfigured
  state.projectsReady = partial.projectsReady
  state.lastSeq = partial.lastSeq
  state.lastSyncedAt = new Date().toISOString()
  state.lastRebuiltAt = state.lastSyncedAt
  state.message = null
}

export function markStale(message: string): void {
  /* Keep whatever indexes exist usable, but signal the data may be behind. */
  if (state.inventoryReady) {
    state.phase = 'stale'
  }
  state.message = message
}

export function touchSynced(): void {
  state.lastSyncedAt = new Date().toISOString()
  if (state.phase === 'stale') {
    state.phase = 'ready'
    state.message = null
  }
}

/* Re-entrancy guards: return false when the corresponding job is already running. */
export function beginRebuild(): boolean {
  if (state.rebuilding) {
    return false
  }
  state.rebuilding = true
  return true
}

/* True while a full rebuild is in flight — lets callers report "already running". */
export function isRebuilding(): boolean {
  return state.rebuilding
}

export function endRebuild(): void {
  state.rebuilding = false
}

export function beginSync(): boolean {
  if (state.syncing || state.rebuilding) {
    return false
  }
  state.syncing = true
  return true
}

export function endSync(): void {
  state.syncing = false
}

/* Full reset (test helper). */
export function resetSearchState(): void {
  state.phase = 'initializing'
  state.inventoryReady = false
  state.projectsReady = false
  state.projectsConfigured = false
  state.catalogReady = false
  state.catalogLastSyncedAt = null
  state.lastSyncedAt = null
  state.lastRebuiltAt = null
  state.message = null
  state.lastSeq = null
  state.lastProjectsSeq = null
  state.rebuilding = false
  state.syncing = false
  state.syncingCatalog = false
}
