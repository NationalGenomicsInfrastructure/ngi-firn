import type { Room } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory locations domain
export const INVENTORY_LOCATIONS_QUERY_KEYS = {
  root: ['inventory', 'locations'] as const,
  rooms: () => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'rooms'] as const,
  room: (roomDocumentId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'room', roomDocumentId] as const,
  roomBySlug: (slug: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'roomBySlug', slug] as const,
  equipment: (equipmentDocId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipment', equipmentDocId] as const,
  equipmentBySlug: (slug: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipmentBySlug', slug] as const,
  equipmentByRoom: (roomDocumentId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipmentByRoom', roomDocumentId] as const,
  equipmentDescendants: (equipmentDocId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipmentDescendants', equipmentDocId] as const
} as const

// Query for all rooms
export const allRoomsQuery = defineQueryOptions<Room[]>({
  key: INVENTORY_LOCATIONS_QUERY_KEYS.rooms(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.locations.getAllRooms.query()
  }
})

// Query for a single room by ID
export const roomQuery = defineQueryOptions(
  (roomDocumentId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.room(roomDocumentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getRoom.query({ id: roomDocumentId })
    }
  })
)

// Query for a single room by slug
export const roomBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.roomBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getRoomBySlug.query({ slug })
    }
  })
)

// Query for a single storage equipment by CouchDB _id
export const equipmentQuery = defineQueryOptions(
  (equipmentDocId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.equipment(equipmentDocId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipment.query({ equipmentId: equipmentDocId })
    }
  })
)

// Query for a single storage equipment by slug
export const equipmentBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentBySlug.query({ slug })
    }
  })
)

// Query for all storage equipment in a room
export const equipmentByRoomQuery = defineQueryOptions(
  (roomDocumentId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(roomDocumentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentByRoom.query({ roomDocumentId })
    }
  })
)

// Query for all descendant containers/items beneath an equipment (flat)
export const equipmentDescendantsQuery = defineQueryOptions(
  (equipmentDocId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentDescendants(equipmentDocId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentDescendants.query({ equipmentId: equipmentDocId })
    }
  })
)
