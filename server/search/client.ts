/*
 * Lazily-constructed Meilisearch client singleton.
 *
 * Returns null whenever the engine is not configured so every caller can treat "search engine
 * absent" as a normal, non-fatal condition rather than an exception.
 */

import { Meilisearch } from 'meilisearch'
import { getSearchEngineConfig } from './config'

let client: Meilisearch | null = null
let resolved = false

export function getSearchClient(): Meilisearch | null {
  if (resolved) {
    return client
  }
  resolved = true

  const config = getSearchEngineConfig()
  if (!config) {
    client = null
    return null
  }

  client = new Meilisearch({ host: config.host, apiKey: config.apiKey })
  return client
}

/* Reset the memoized client (test helper; lets a test re-read changed env). */
export function resetSearchClient(): void {
  client = null
  resolved = false
}
