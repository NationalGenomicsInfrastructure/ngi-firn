import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { Room, StorageEquipment } from '~~/types/inventory'
import type {
  CreateRoomSchemaInput,
  UpdateRoomSchemaInput,
  CreateEquipmentSchemaInput,
  UpdateEquipmentSchemaInput,
  MoveEquipmentSchemaInput
} from '~~/schemas/inventory-locations'
import { INVENTORY_LOCATIONS_QUERY_KEYS } from '~/utils/queries/inventory/locations'

const { showSuccess, showError } = useFirnToast()

type DeleteRoomInput = { id: string, rev: string, roomName?: string }
type DeleteEquipmentInput = { id: string, rev: string, equipmentName?: string, roomId?: string }

// Room mutations

export const createRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateRoomSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.createRoom.mutate(input)
    },
    onMutate() {
      const queryCache = useQueryCache()
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_LOCATIONS_QUERY_KEYS.rooms()) || []
      return { rooms }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), context.rooms ?? [])
      showError(error.message, 'Room could not be created')
    },
    onSuccess(_data, input) {
      showSuccess(`Room "${input.name}" created successfully.`, 'Room created')
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), exact: true })
    }
  })
  return { createRoom: mutate, ...mutation }
})

export const updateRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateRoomSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.updateRoom.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_LOCATIONS_QUERY_KEYS.rooms()) || []
      const room = queryCache.getQueryData<Room>(INVENTORY_LOCATIONS_QUERY_KEYS.room(input.id))
      return { rooms, room }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), context.rooms ?? [])
      if (context.room) {
        queryCache.setQueryData(INVENTORY_LOCATIONS_QUERY_KEYS.room(input.id), context.room)
      }
      showError(error.message, 'Room could not be updated')
    },
    onSuccess() {
      showSuccess('Room updated successfully.', 'Room updated')
    },
    onSettled(_, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.room(input.id), exact: true })
    }
  })
  return { updateRoom: mutate, ...mutation }
})

export const deleteRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteRoomInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.deleteRoom.mutate({ id: input.id, rev: input.rev })
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_LOCATIONS_QUERY_KEYS.rooms()) || []
      queryCache.cancelQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), exact: true })
      queryCache.setQueryData(
        INVENTORY_LOCATIONS_QUERY_KEYS.rooms(),
        rooms.filter(r => r._id !== input.id)
      )
      return { rooms }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), context.rooms ?? [])
      showError(error.message, 'Room could not be deleted')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Room${input.roomName ? ` "${input.roomName}"` : ''} deleted successfully.`,
        'Room deleted'
      )
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.rooms(), exact: true })
    }
  })
  return { deleteRoom: mutate, ...mutation }
})

// Equipment mutations

export const createEquipment = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateEquipmentSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.createEquipment.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const equipment = queryCache.getQueryData<StorageEquipment[]>(
        INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.parentId)
      ) || []
      return { equipment }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(
        INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.parentId),
        context.equipment ?? []
      )
      showError(error.message, 'Equipment could not be created')
    },
    onSuccess(_data, input) {
      showSuccess(`Equipment "${input.name}" created successfully.`, 'Equipment created')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.parentId),
        exact: true
      })
    }
  })
  return { createEquipment: mutate, ...mutation }
})

export const updateEquipment = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateEquipmentSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.updateEquipment.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const equipment = queryCache.getQueryData<StorageEquipment>(
        INVENTORY_LOCATIONS_QUERY_KEYS.equipment(input.id)
      )
      return { equipment }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.equipment) {
        queryCache.setQueryData(INVENTORY_LOCATIONS_QUERY_KEYS.equipment(input.id), context.equipment)
      }
      showError(error.message, 'Equipment could not be updated')
    },
    onSuccess() {
      showSuccess('Equipment updated successfully.', 'Equipment updated')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.equipment(input.id), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.root })
    }
  })
  return { updateEquipment: mutate, ...mutation }
})

export const moveEquipmentToRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveEquipmentSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.moveEquipmentToRoom.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Equipment could not be moved')
    },
    onSuccess() {
      showSuccess('Equipment moved successfully.', 'Equipment moved')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.equipment(input.equipmentId), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.root })
    }
  })
  return { moveEquipmentToRoom: mutate, ...mutation }
})

export const deleteEquipment = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteEquipmentInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.deleteEquipment.mutate({ id: input.id, rev: input.rev })
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      if (input.roomId) {
        const equipment = queryCache.getQueryData<StorageEquipment[]>(
          INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.roomId)
        ) || []
        queryCache.cancelQueries({
          key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.roomId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.roomId),
          equipment.filter(e => e._id !== input.id)
        )
        return { equipment, roomId: input.roomId }
      }
      return { equipment: undefined, roomId: undefined }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      if (context.roomId && context.equipment) {
        queryCache.setQueryData(
          INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(context.roomId),
          context.equipment
        )
      }
      showError(error.message, 'Equipment could not be deleted')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Equipment${input.equipmentName ? ` "${input.equipmentName}"` : ''} deleted successfully.`,
        'Equipment deleted'
      )
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      if (input.roomId) {
        queryCache.invalidateQueries({
          key: INVENTORY_LOCATIONS_QUERY_KEYS.equipmentByRoom(input.roomId),
          exact: true
        })
      }
      queryCache.invalidateQueries({ key: INVENTORY_LOCATIONS_QUERY_KEYS.root })
    }
  })
  return { deleteEquipment: mutate, ...mutation }
})
