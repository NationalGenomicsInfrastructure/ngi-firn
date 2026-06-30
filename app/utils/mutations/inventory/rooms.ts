import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { Room } from '~~/types/inventory'
import type {
  CreateRoomInput,
  UpdateRoomInput,
  DeleteRoomInput
} from '~~/schemas/inventory/rooms'
import { INVENTORY_ROOMS_QUERY_KEYS } from '~/utils/queries/inventory/rooms'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'

const { showSuccess, showError } = useFirnToast()

// Extend the schema-valid delete payload ({ slug: string[] }) with optional UI-only
// metadata used for user-facing toasts; roomName is never sent to the API.
type DeleteRoomMutationInput = DeleteRoomInput & { roomName?: string }

// Room mutations

export const createRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateRoomInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.rooms.createRoom.mutate(input)
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
    mutation: (input: UpdateRoomInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.rooms.updateRoom.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_ROOMS_QUERY_KEYS.list()) || []
      const room = queryCache.getQueryData<Room>(INVENTORY_ROOMS_QUERY_KEYS.detailBySlug(input.slug))
      return { rooms, room }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.list(), context.rooms ?? [])
      if (context.room) {
        queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.detailBySlug(input.slug), context.room)
      }
      showError(error.message, 'Room could not be updated')
    },
    onSuccess(response: Room) {
      showSuccess(`Room "${response.name}" updated successfully.`, 'Room updated')
      navigateTo(`/inventory/rooms/${encodeURIComponent(response.slug)}`)
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.detailBySlug(input.slug), exact: true })
      if (data && data.slug !== input.slug) {
        queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.detailBySlug(data.slug), exact: true })
      }
      queryCache.invalidateQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.list(), exact: true })
    }
  })
  return { updateRoom: mutate, ...mutation }
})

export const deleteRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteRoomMutationInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.rooms.deleteRoom.mutate({ slug: input.slug })
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const rooms = queryCache.getQueryData<Room[]>(INVENTORY_ROOMS_QUERY_KEYS.list()) || []
      queryCache.cancelQueries({ key: INVENTORY_ROOMS_QUERY_KEYS.list(), exact: true })
      queryCache.setQueryData(
        INVENTORY_ROOMS_QUERY_KEYS.list(),
        rooms.filter(r => !input.slug.includes(r.slug))
      )
      return { rooms }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(INVENTORY_ROOMS_QUERY_KEYS.list(), context.rooms ?? [])
      showError(error.message, 'Room could not be deleted')
    },
    onSuccess(_data, input) {
      const roomLabel = input.roomName ?? (input.slug.length === 1 ? input.slug[0] : undefined)
      showSuccess(
        `Room${roomLabel ? ` "${roomLabel}"` : ''} deleted successfully.`,
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
