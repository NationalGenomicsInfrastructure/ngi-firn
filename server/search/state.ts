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
  lastSyncedAt: string | null
  lastRebuiltAt: string | null
  message: string | null
  /* CouchDB update sequence already reflected in the inventory index. */
  lastSeq: string | null
  rebuilding: boolean
  syncing: boolean
}

const state: InternalSearchState = {
  phase: 'initializing',
  inventoryReady: false,
  projectsReady: false,
  projectsConfigured: false,
  lastSyncedAt: null,
  lastRebuiltAt: null,
  message: null,
  lastSeq: null,
  rebuilding: false,
  syncing: false
}

export function getSearchState(): SearchIndexStatus {
  return {
    phase: state.phase,
    inventoryReady: state.inventoryReady,
    projectsReady: state.projectsReady,
    projectsConfigured: state.projectsConfigured,
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

export function markUnavailable(message: string): void {
  state.phase = 'unavailable'
  state.inventoryReady = false
  state.projectsReady = false
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
  state.lastSyncedAt = null
  state.lastRebuiltAt = null
  state.message = null
  state.lastSeq = null
  state.rebuilding = false
  state.syncing = false
}
