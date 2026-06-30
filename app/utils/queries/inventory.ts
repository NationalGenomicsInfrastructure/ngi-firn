import { defineQueryOptions } from '@pinia/colada'

export interface InventoryCounts {
  rooms: number
  equipment: number
  containers: number
  items: number
}

export const INVENTORY_QUERY_KEYS = {
  root: ['inventory'] as const,
  counts: () => [...INVENTORY_QUERY_KEYS.root, 'counts'] as const
} as const

export const inventoryCountsQuery = defineQueryOptions<InventoryCounts>({
  key: INVENTORY_QUERY_KEYS.counts(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.getCounts.query()
  }
})
