import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { StorageEquipment } from '~~/types/inventory'
import type {
  CreateEquipmentSchemaInput,
  UpdateEquipmentSchemaInput,
  MoveEquipmentSchemaInput
} from '~~/schemas/inventory-locations'
import { INVENTORY_EQUIPMENT_QUERY_KEYS } from '~/utils/queries/inventory/equipment'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'

const { showSuccess, showError } = useFirnToast()

type DeleteEquipmentInput = { id: string, rev: string, equipmentName?: string, roomDocumentId?: string }
type UpdateEquipmentInput = UpdateEquipmentSchemaInput & { roomDocumentId?: string }
type MoveEquipmentInput = MoveEquipmentSchemaInput & { currentRoomDocumentId?: string }

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
        INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.parentId)
      ) || []
      return { equipment }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(
        INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.parentId),
        context.equipment ?? []
      )
      showError(error.message, 'Equipment could not be created')
    },
    onSuccess(_data, input) {
      showSuccess(`Equipment "${input.name}" created successfully.`, 'Equipment created')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.parentId), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { createEquipment: mutate, ...mutation }
})

export const updateEquipment = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateEquipmentInput) => {
      const { $trpc } = useNuxtApp()
      const { roomDocumentId, ...payload } = input
      void roomDocumentId
      return $trpc.inventory.locations.updateEquipment.mutate(payload)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const equipment = queryCache.getQueryData<StorageEquipment>(
        INVENTORY_EQUIPMENT_QUERY_KEYS.detail(input.id)
      )
      return { equipment }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.equipment) {
        queryCache.setQueryData(INVENTORY_EQUIPMENT_QUERY_KEYS.detail(input.id), context.equipment)
      }
      showError(error.message, 'Equipment could not be updated')
    },
    onSuccess() {
      showSuccess('Equipment updated successfully.', 'Equipment updated')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.detail(input.id), exact: true })
      if (input.roomDocumentId) {
        queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomDocumentId), exact: true })
      }
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
    }
  })
  return { updateEquipment: mutate, ...mutation }
})

export const moveEquipmentToRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveEquipmentInput) => {
      const { $trpc } = useNuxtApp()
      const { currentRoomDocumentId, ...payload } = input
      void currentRoomDocumentId
      return $trpc.inventory.locations.moveEquipmentToRoom.mutate(payload)
    },
    onError(error: Error) {
      showError(error.message, 'Equipment could not be moved')
    },
    onSuccess() {
      showSuccess('Equipment moved successfully.', 'Equipment moved')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.detail(input.equipmentId), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.newRoomId), exact: true })
      if (input.currentRoomDocumentId) {
        queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.currentRoomDocumentId), exact: true })
      }
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.descendants(input.equipmentId), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
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
      if (input.roomDocumentId) {
        const equipment = queryCache.getQueryData<StorageEquipment[]>(
          INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomDocumentId)
        ) || []
        queryCache.cancelQueries({
          key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomDocumentId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomDocumentId),
          equipment.filter(e => e._id !== input.id)
        )
        return { equipment, roomDocumentId: input.roomDocumentId }
      }
      return { equipment: undefined, roomDocumentId: undefined }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      if (context.roomDocumentId && context.equipment) {
        queryCache.setQueryData(
          INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(context.roomDocumentId),
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
      if (input.roomDocumentId) {
        queryCache.invalidateQueries({
          key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomDocumentId),
          exact: true
        })
      }
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { deleteEquipment: mutate, ...mutation }
})
