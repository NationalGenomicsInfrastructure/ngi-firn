import type { DisplayStorageEquipment } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory equipment domain
export const INVENTORY_EQUIPMENT_QUERY_KEYS = {
  root: ['inventory', 'equipment'] as const,
  list: () => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'list'] as const,
  byRoom: (roomSlug: string) => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'by-room', roomSlug] as const,
  detailBySlug: (slug: string) => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'detail', 'slug', slug] as const,
} as const

// Query for a single storage equipment by slug
export const equipmentBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.equipment.getEquipmentBySlug.query({ slug })
    }
  })
)

// Query for all storage equipment in a room
export const equipmentByRoomQuery = defineQueryOptions(
  (roomSlug: string) => ({
    key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(roomSlug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.equipment.getEquipmentByRoom.query({ roomSlug })
    }
  })
)

// Query for all storage equipment across all rooms
export const allEquipmentQuery = defineQueryOptions<DisplayStorageEquipment[]>({
  key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.equipment.getAllEquipment.query()
  }
})
