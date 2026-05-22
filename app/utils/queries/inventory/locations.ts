import type { Room } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory locations domain
export const INVENTORY_LOCATIONS_QUERY_KEYS = {
  root: ['inventory', 'locations'] as const,
  rooms: () => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'rooms'] as const,
  room: (roomId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'room', roomId] as const,
  equipment: (equipmentId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipment', equipmentId] as const,
  equipmentByRoom: (roomId: string) => [...INVENTORY_LOCATIONS_QUERY_KEYS.root, 'equipmentByRoom', roomId] as const
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
  (roomId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.room(roomId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getRoom.query({ roomId })
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
  (roomId: string) => ({
    key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(roomId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.getEquipmentByRoom.query({ roomId })
    }
  })
)
