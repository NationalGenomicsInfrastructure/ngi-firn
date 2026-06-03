import type { Room } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory locations domain
export const INVENTORY_LOCATIONS_QUERY_KEYS = {
  root: ['inventory', 'locations'] as const,
  rooms: () => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'rooms'] as const,
  room: (roomDocumentId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'room', roomDocumentId] as const,
  roomBySlug: (slug: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'roomBySlug', slug] as const,
  equipment: (equipmentId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipment', equipmentId] as const,
  equipmentByRoom: (roomDocumentId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipmentByRoom', roomDocumentId] as const
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

// Query for a single storage equipment by ID
export const equipmentQuery = defineQueryOptions(
  (equipmentId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.equipment(equipmentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipment.query({ equipmentId })
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
