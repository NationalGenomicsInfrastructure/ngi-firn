import type { StorageEquipment } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory equipment domain
export const INVENTORY_EQUIPMENT_QUERY_KEYS = {
  root: ['inventory', 'equipment'] as const,
  list: () => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'list'] as const,
  byRoom: (roomId: string) => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'by-room', roomId] as const,
  detail: (equipmentId: string) => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'detail', equipmentId] as const,
  detailBySlug: (slug: string) => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'detail', 'slug', slug] as const,
  descendants: (equipmentId: string) => [...INVENTORY_EQUIPMENT_QUERY_KEYS.root, 'descendants', equipmentId] as const,
} as const

// Query for a single storage equipment by CouchDB _id
export const equipmentQuery = defineQueryOptions(
  (equipmentDocId: string) => ({
    key: INVENTORY_EQUIPMENT_QUERY_KEYS.detail(equipmentDocId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipment.query({ equipmentId: equipmentDocId })
    }
  })
)

// Query for a single storage equipment by slug
export const equipmentBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentBySlug.query({ slug })
    }
  })
)

// Query for all storage equipment in a room
export const equipmentByRoomQuery = defineQueryOptions(
  (roomDocumentId: string) => ({
    key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(roomDocumentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentByRoom.query({ roomDocumentId })
    }
  })
)

// Query for all descendant containers/items beneath an equipment (flat)
export const equipmentDescendantsQuery = defineQueryOptions(
  (equipmentDocId: string) => ({
    key: INVENTORY_EQUIPMENT_QUERY_KEYS.descendants(equipmentDocId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentDescendants.query({ equipmentId: equipmentDocId })
    }
  })
)

// Query for all storage equipment across all rooms
export const allEquipmentQuery = defineQueryOptions<StorageEquipment[]>({
  key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.locations.getAllEquipment.query()
  }
})
