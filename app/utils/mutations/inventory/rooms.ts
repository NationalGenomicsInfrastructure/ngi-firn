import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { Room } from '~~/types/inventory'
import type {
  CreateRoomSchemaInput,
  UpdateRoomSchemaInput
} from '~~/schemas/inventory-locations'
import { INVENTORY_ROOMS_QUERY_KEYS } from '~/utils/queries/inventory/rooms'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'

const { showSuccess, showError } = useFirnToast()

type DeleteRoomInput = { id: string, rev: string, roomName?: string }

// Room mutations

export const createRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateRoomSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.locations.createRoom.mutate(input)
    },
    onMutate() {
      const queryCache = useQueryCache()
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_ROOMS_QUERY_KEYS.list()) || []
      return { rooms }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.list(), context.rooms ?? [])
      showError(error.message, 'Room could not be created')
    },
    onSuccess(response: Room) {
      showSuccess(`Room "${response.name}" created successfully.`, 'Room created')
      navigateTo(`/inventory/rooms/${encodeURIComponent(response.slug)}`)
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.list(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
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
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_ROOMS_QUERY_KEYS.list()) || []
      const room = queryCache.getQueryData<Room>(INVENTORY_ROOMS_QUERY_KEYS.detail(input.id))
      return { rooms, room }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.list(), context.rooms ?? [])
      if (context.room) {
        queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.detail(input.id), context.room)
      }
      showError(error.message, 'Room could not be updated')
    },
    onSuccess(response: Room) {
      showSuccess(`Room "${response.name}" updated successfully.`, 'Room updated')
      navigateTo(`/inventory/rooms/${encodeURIComponent(response.slug)}`)
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.detail(input.id), exact: true })
      if (data) {
        queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.detailBySlug(data.slug), exact: true })
      }
      queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.list(), exact: true })
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
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_ROOMS_QUERY_KEYS.list()) || []
      queryCache.cancelQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.list(), exact: true })
      queryCache.setQueryData(
        INVENTORY_ROOMS_QUERY_KEYS.list(),
        rooms.filter(r => r._id !== input.id)
      )
      return { rooms }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.list(), context.rooms ?? [])
      showError(error.message, 'Room could not be deleted')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Room${input.roomName ? ` "${input.roomName}"` : ''} deleted successfully.`,
        'Room deleted'
      )
      navigateTo('/inventory/rooms')
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.list(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { deleteRoom: mutate, ...mutation }
})
