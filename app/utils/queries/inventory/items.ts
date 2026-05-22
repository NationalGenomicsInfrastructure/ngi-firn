import type { InventoryItem } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory items domain
export const INVENTORY_ITEMS_QUERY_KEYS = {
  root: ['inventory', 'items'] as const,
  item: (itemId: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'item', itemId] as const,
  byParent: (parentId: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'byParent', parentId] as const,
  byStatus: (status: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'byStatus', status] as const,
  expiring: (beforeDate: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'expiring', beforeDate] as const,
  search: (query: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'search', query] as const,
  breadcrumb: (itemId: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'breadcrumb', itemId] as const
} as const

// Query for a single item by ID
export const itemQuery = defineQueryOptions(
  (itemId: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.item(itemId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItem.query({ itemId })
    }
  })
)

// Query for items by parent container ID
export const itemsByParentQuery = defineQueryOptions(
  (parentId: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.byParent(parentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemsByParent.query({ parentId })
    }
  })
)

// Query for items filtered by status
export const itemsByStatusQuery = defineQueryOptions(
  (status: InventoryItem['status']) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.byStatus(status),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemsByStatus.query({ status })
    }
  })
)

// Query for items expiring before a given date
export const expiringItemsQuery = defineQueryOptions(
  (beforeDate: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.expiring(beforeDate),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getExpiringItems.query({ beforeDate })
    }
  })
)

// Query for items matching a search string
export const searchItemsQuery = defineQueryOptions(
  (query: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.search(query),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.searchItems.query({ query })
    }
  })
)

// Query for the breadcrumb path of an item (ancestor chain)
export const itemBreadcrumbQuery = defineQueryOptions(
  (itemId: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.breadcrumb(itemId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemLocationBreadcrumb.query({ itemId })
    }
  })
)
