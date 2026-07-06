import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { DisplayStorageEquipment } from '~~/types/inventory'
import type {
  CreateEquipmentInput,
  UpdateEquipmentInput,
  MoveEquipmentInput,
  DeleteEquipmentInput
} from '~~/schemas/inventory/equipment'
import { INVENTORY_EQUIPMENT_QUERY_KEYS } from '~/utils/queries/inventory/equipment'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'

const { showSuccess, showError } = useFirnToast()

// Equipment mutations

export const createEquipment = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateEquipmentInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.equipment.createEquipment.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const equipment = queryCache.getQueryData<DisplayStorageEquipment[]>(
        INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.parentSlug)
      ) || []
      return { equipment }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(
        INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.parentSlug),
        context.equipment ?? []
      )
      showError(error.message, 'Equipment could not be created')
    },
    onSuccess(response: DisplayStorageEquipment, _input) {
      showSuccess(`Equipment "${response.name}" created successfully.`, 'Equipment created')
      navigateTo(`/inventory/equipment/${encodeURIComponent(response.slug)}`)
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.parentSlug), exact: true })
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
      return $trpc.inventory.equipment.updateEquipment.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const equipment = queryCache.getQueryData<DisplayStorageEquipment>(
        INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(input.equipmentSlug)
      )
      return { equipment }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.equipment) {
        queryCache.setQueryData(INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(input.equipmentSlug), context.equipment)
      }
      showError(error.message, 'Equipment could not be updated')
    },
    onSuccess(response: DisplayStorageEquipment, _input) {
      showSuccess(`Equipment "${response.name}" updated successfully.`, 'Equipment updated')
      navigateTo(`/inventory/equipment/${encodeURIComponent(response.slug)}`)
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(input.equipmentSlug), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
    }
  })
  return { updateEquipment: mutate, ...mutation }
})

export const moveEquipmentToRoom = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveEquipmentInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.equipment.moveEquipmentToRoom.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Equipment could not be moved')
    },
    onSuccess() {
      showSuccess('Equipment moved successfully.', 'Equipment moved')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(input.equipmentSlug), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.newRoomSlug), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
    }
  })
  return { moveEquipmentToRoom: mutate, ...mutation }
})

// Extend the schema-valid delete payload ({ equipmentSlug }) with optional UI-only
// metadata used for user-facing toasts; roomSlug and equipmentName are never sent to the API.
type DeleteEquipmentMutationInput = DeleteEquipmentInput & { roomSlug?: string, equipmentName?: string }

export const deleteEquipment = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteEquipmentMutationInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.equipment.deleteEquipment.mutate({ equipmentSlug: input.equipmentSlug })
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      if (input.roomSlug) {
        const equipment = queryCache.getQueryData<DisplayStorageEquipment[]>(
          INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomSlug)
        ) || []
        queryCache.cancelQueries({
          key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomSlug),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomSlug),
          equipment.filter(e => e.slug !== input.equipmentSlug)
        )
        return { equipment, roomSlug: input.roomSlug }
      }
      return { equipment: undefined, roomSlug: undefined }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      if (context.roomSlug && context.equipment) {
        queryCache.setQueryData(
          INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(context.roomSlug),
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
      navigateTo('/inventory/equipment')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      if (input.roomSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_EQUIPMENT_QUERY_KEYS.byRoom(input.roomSlug),
          exact: true
        })
      }
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.list(), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { deleteEquipment: mutate, ...mutation }
})
