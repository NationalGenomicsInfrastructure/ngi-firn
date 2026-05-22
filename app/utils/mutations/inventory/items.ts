import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { InventoryItem, InventoryTask } from '~~/types/inventory'
import type {
  CreateItemSchemaInput,
  UpdateItemSchemaInput,
  MoveItemSchemaInput,
  CheckoutItemSchemaInput,
  ReturnItemSchemaInput,
  ReserveItemSchemaInput,
  DisposeItemSchemaInput,
  FlagItemSchemaInput
} from '~~/schemas/inventory-items'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_TASKS_QUERY_KEYS } from '~/utils/queries/inventory/tasks'

// Notifications
const { showSuccess, showError } = useFirnToast()

// Local wrapper type for delete (not in schemas)
type DeleteItemInput = { id: string, rev: string, itemName?: string, parentId?: string }

// Input type for unreserve (not exported from schemas)
type UnreserveItemInput = { itemId: string }

/**
 * Helper functions for item mutations
 **/

// Optimistically update a cached item's status
function optimisticStatusUpdate(itemId: string, newStatus: InventoryItem['status']) {
  const queryCache = useQueryCache()
  const item = queryCache.getQueryData<InventoryItem>(INVENTORY_ITEMS_QUERY_KEYS.item(itemId))
  if (item) {
    queryCache.cancelQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.item(itemId), exact: true })
    queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.item(itemId), { ...item, status: newStatus })
  }
  return { previousItem: item ?? null }
}

// Roll back an optimistic status update
function rollbackStatusUpdate(itemId: string, previousItem: InventoryItem | null | undefined) {
  const queryCache = useQueryCache()
  if (previousItem) {
    queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.item(itemId), previousItem)
  }
}

// Invalidate queries affected by item status changes
function invalidateItemStatusQueries(itemId: string) {
  const queryCache = useQueryCache()
  queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.item(itemId), exact: true })
  // Invalidate all byStatus queries (we don't know which status lists changed)
  queryCache.invalidateQueries({ key: [...INVENTORY_ITEMS_QUERY_KEYS.root, 'byStatus'] })
}

/**
 * CRUD mutations
 **/

// Mutation for creating an inventory item

export const createItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.createItem.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Item could not be created.')
    },
    onSuccess(_data, input) {
      showSuccess(`Item "${input.name}" created successfully.`, 'Item created')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.contents(input.parentId),
        exact: true
      })
    }
  })
  return { createItem: mutate, ...mutation }
})

// Mutation for updating an inventory item

export const updateItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.updateItem.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Item could not be updated.')
    },
    onSuccess() {
      showSuccess('Item updated successfully.', 'Item updated')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.item(input.id), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
    }
  })
  return { updateItem: mutate, ...mutation }
})

// Mutation for moving an item between parents

export const moveItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.moveItem.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Item could not be moved.')
    },
    onSuccess() {
      showSuccess('Item moved successfully.', 'Item moved')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
      queryCache.invalidateQueries({
        key: INVENTORY_ITEMS_QUERY_KEYS.breadcrumb(input.itemId),
        exact: true
      })
    }
  })
  return { moveItem: mutate, ...mutation }
})

// Mutation for deleting an inventory item

export const deleteItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteItemInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.deleteItem.mutate({ id: input.id, rev: input.rev })
    },
    onMutate(input: DeleteItemInput) {
      const queryCache = useQueryCache()
      let previousItems: InventoryItem[] | null = null

      if (input.parentId) {
        const items = queryCache.getQueryData<InventoryItem[]>(
          INVENTORY_ITEMS_QUERY_KEYS.byParent(input.parentId)
        ) || []
        previousItems = items
        queryCache.cancelQueries({
          key: INVENTORY_ITEMS_QUERY_KEYS.byParent(input.parentId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_ITEMS_QUERY_KEYS.byParent(input.parentId),
          items.filter(i => i._id !== input.id)
        )
      }

      return { previousItems, parentId: input.parentId }
    },
    onError(error: Error, input: DeleteItemInput, context) {
      const queryCache = useQueryCache()
      if (context.parentId && context.previousItems) {
        queryCache.setQueryData(
          INVENTORY_ITEMS_QUERY_KEYS.byParent(context.parentId),
          context.previousItems
        )
      }
      showError(error.message, `Item${input.itemName ? ` "${input.itemName}"` : ''} could not be deleted.`)
    },
    onSuccess(_data, input) {
      showSuccess(
        `Item${input.itemName ? ` "${input.itemName}"` : ''} deleted successfully.`,
        'Item deleted'
      )
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      if (input.parentId) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.contents(input.parentId),
          exact: true
        })
      }
    }
  })
  return { deleteItem: mutate, ...mutation }
})

/**
 * Workflow mutations
 **/

// Mutation for checking out an item

export const checkoutItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CheckoutItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.checkoutItem.mutate(input) as Promise<{
        item: InventoryItem
        returnTask: InventoryTask
      }>
    },
    onMutate(input: CheckoutItemSchemaInput) {
      return optimisticStatusUpdate(input.itemId, 'checked_out')
    },
    onError(error: Error, input: CheckoutItemSchemaInput, context) {
      rollbackStatusUpdate(input.itemId, context.previousItem)
      showError(error.message, 'Item could not be checked out.')
    },
    onSuccess() {
      showSuccess('Item checked out successfully.', 'Item checked out')
    },
    onSettled(_data, _error, input) {
      invalidateItemStatusQueries(input.itemId)
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { checkoutItem: mutate, ...mutation }
})

// Mutation for returning a checked-out item

export const returnItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: ReturnItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.returnItem.mutate(input)
    },
    onMutate(input: ReturnItemSchemaInput) {
      return optimisticStatusUpdate(input.itemId, 'available')
    },
    onError(error: Error, input: ReturnItemSchemaInput, context) {
      rollbackStatusUpdate(input.itemId, context.previousItem)
      showError(error.message, 'Item could not be returned.')
    },
    onSuccess() {
      showSuccess('Item returned successfully.', 'Item returned')
    },
    onSettled(_data, _error, input) {
      invalidateItemStatusQueries(input.itemId)
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_ITEMS_QUERY_KEYS.byParent(input.parentId),
        exact: true
      })
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.contents(input.parentId),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { returnItem: mutate, ...mutation }
})

// Mutation for reserving an item

export const reserveItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: ReserveItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.reserveItem.mutate(input)
    },
    onMutate(input: ReserveItemSchemaInput) {
      return optimisticStatusUpdate(input.itemId, 'reserved')
    },
    onError(error: Error, input: ReserveItemSchemaInput, context) {
      rollbackStatusUpdate(input.itemId, context.previousItem)
      showError(error.message, 'Item could not be reserved.')
    },
    onSuccess() {
      showSuccess('Item reserved successfully.', 'Item reserved')
    },
    onSettled(_data, _error, input) {
      invalidateItemStatusQueries(input.itemId)
    }
  })
  return { reserveItem: mutate, ...mutation }
})

// Mutation for unreserving an item

export const unreserveItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UnreserveItemInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.unreserveItem.mutate(input)
    },
    onMutate(input: UnreserveItemInput) {
      return optimisticStatusUpdate(input.itemId, 'available')
    },
    onError(error: Error, input: UnreserveItemInput, context) {
      rollbackStatusUpdate(input.itemId, context.previousItem)
      showError(error.message, 'Item could not be unreserved.')
    },
    onSuccess() {
      showSuccess('Reservation removed successfully.', 'Item unreserved')
    },
    onSettled(_data, _error, input) {
      invalidateItemStatusQueries(input.itemId)
    }
  })
  return { unreserveItem: mutate, ...mutation }
})

// Mutation for disposing an item

export const disposeItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DisposeItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.disposeItem.mutate(input)
    },
    onMutate(input: DisposeItemSchemaInput) {
      return optimisticStatusUpdate(input.itemId, 'disposed')
    },
    onError(error: Error, input: DisposeItemSchemaInput, context) {
      rollbackStatusUpdate(input.itemId, context.previousItem)
      showError(error.message, 'Item could not be disposed.')
    },
    onSuccess() {
      showSuccess('Item disposed successfully.', 'Item disposed')
    },
    onSettled(_data, _error, input) {
      invalidateItemStatusQueries(input.itemId)
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { disposeItem: mutate, ...mutation }
})

// Mutation for flagging an item

export const flagItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: FlagItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.flagItem.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Item could not be flagged.')
    },
    onSuccess() {
      showSuccess('Item flagged successfully.', 'Item flagged')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.item(input.itemId), exact: true })
    }
  })
  return { flagItem: mutate, ...mutation }
})
