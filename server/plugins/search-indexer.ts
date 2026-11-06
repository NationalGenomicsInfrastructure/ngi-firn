/*
 * Background search indexer (single Nitro worker).
 *
 * On startup, kicks off an initial full rebuild without blocking server boot, then runs two
 * timers: a frequent incremental _changes sync for freshness and a slower full rebuild that
 * reconciles project grouping and prunes deletions. When the search engine is unconfigured the
 * plugin is a no-op, so the app runs identically with or without Meilisearch.
 *
 * `hooks.hook('close', …)` clears the timers so the worker shuts down cleanly.
 */

import {
  fullRebuildIntervalMs,
  incrementalSyncIntervalMs,
  isSearchConfigured
} from '../search/config'
import { rebuildAll, syncInventoryChanges, syncProjectCatalogChanges } from '../search/indexer'

export default defineNitroPlugin((nitroApp) => {
  if (!isSearchConfigured()) {
    console.log('🔎 Search engine not configured (MEILISEARCH_HOST unset); global search disabled.')
    return
  }

  const timers: NodeJS.Timeout[] = []
  let stopped = false

  /* Initial bootstrap rebuild — detached so a slow/absent engine never delays server boot. */
  void rebuildAll().then(() => {
    if (stopped) {
      return
    }
    timers.push(setInterval(() => void syncInventoryChanges(), incrementalSyncIntervalMs()))
    timers.push(setInterval(() => void syncProjectCatalogChanges(), incrementalSyncIntervalMs()))
    timers.push(setInterval(() => void rebuildAll(), fullRebuildIntervalMs()))
  })

  nitroApp.hooks.hook('close', () => {
    stopped = true
    for (const timer of timers) {
      clearInterval(timer)
    }
  })
})
