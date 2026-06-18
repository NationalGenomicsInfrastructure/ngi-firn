import type { Room } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory rooms domain
export const INVENTORY_ROOMS_QUERY_KEYS = {
  root: ['inventory', 'rooms'] as const,
  list: () => [...INVENTORY_ROOMS_QUERY_KEYS.root, 'list'] as const,
  detail: (roomId: string) => [...INVENTORY_ROOMS_QUERY_KEYS.root, 'detail', roomId] as const,
  detailBySlug: (slug: string) => [...INVENTORY_ROOMS_QUERY_KEYS.root, 'detail', 'slug', slug] as const,
} as const

// Query for all rooms
export const allRoomsQuery = defineQueryOptions<Room[]>({
  key: INVENTORY_ROOMS_QUERY_KEYS.list(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.locations.getAllRooms.query()
  }
})

// Query for a single room by ID
export const roomQuery = defineQueryOptions(
  (roomDocumentId: string) => ({
    key: INVENTORY_ROOMS_QUERY_KEYS.detail(roomDocumentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getRoom.query({ id: roomDocumentId })
    }
  })
)

// Query for a single room by slug
export const roomBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_ROOMS_QUERY_KEYS.detailBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getRoomBySlug.query({ slug })
    }
  })
)
