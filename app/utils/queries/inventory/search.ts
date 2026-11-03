import { defineQueryOptions } from '@pinia/colada'
import type { InventorySearchInput, ProjectGroupInventoryInput } from '~~/schemas/inventory/search'
import type { InventorySearchResponse, SearchIndexStatus, SearchInventoryPage } from '~~/types/search'

/*
 * Query keys and options for the global inventory search.
 *
 * Search results are parameterized by the full (already-debounced) request object, so the cache
 * key embeds a stable serialization of that request: two identical searches share a cache entry,
 * and any change to query text, filters or pagination produces a fresh key.
 */
export const INVENTORY_SEARCH_QUERY_KEYS = {
  root: ['inventory', 'search'] as const,
  results: (input: InventorySearchInput) =>
    [...INVENTORY_SEARCH_QUERY_KEYS.root, 'results', JSON.stringify(input)] as const,
  projectGroup: (input: ProjectGroupInventoryInput) =>
    [...INVENTORY_SEARCH_QUERY_KEYS.root, 'project-group', JSON.stringify(input)] as const,
  status: () => [...INVENTORY_SEARCH_QUERY_KEYS.root, 'status'] as const
} as const

export const inventorySearchQuery = defineQueryOptions(
  (input: InventorySearchInput) => ({
    key: INVENTORY_SEARCH_QUERY_KEYS.results(input),
    query: (): Promise<InventorySearchResponse> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.search.search.query(input)
    }
  })
)

export const projectGroupInventoryQuery = defineQueryOptions(
  (input: ProjectGroupInventoryInput) => ({
    key: INVENTORY_SEARCH_QUERY_KEYS.projectGroup(input),
    query: (): Promise<SearchInventoryPage> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.search.projectGroupInventory.query(input)
    }
  })
)

export const searchStatusQuery = defineQueryOptions({
  key: INVENTORY_SEARCH_QUERY_KEYS.status(),
  query: (): Promise<SearchIndexStatus> => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.search.status.query()
  }
})
