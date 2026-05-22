import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { Container } from '~~/types/inventory'
import type {
  CreateContainerSchemaInput,
  UpdateContainerSchemaInput,
  MoveContainerSchemaInput
} from '~~/schemas/inventory-containers'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'

const { showSuccess, showError } = useFirnToast()

type DeleteContainerInput = { id: string, rev: string, containerName?: string, parentId?: string }

// Container mutations

export const createContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateContainerSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.createContainer.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const byParent = queryCache.getQueryData<Container[]>(
        INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId)
      ) || []
      return { byParent }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(
        INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId),
        context.byParent ?? []
      )
      showError(error.message, 'Container could not be created')
    },
    onSuccess(_data, input) {
      showSuccess(`Container "${input.name}" created successfully.`, 'Container created')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId),
        exact: true
      })
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.contents(input.parentId),
        exact: true
      })
    }
  })
  return { createContainer: mutate, ...mutation }
})

export const updateContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateContainerSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.updateContainer.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const container = queryCache.getQueryData<Container>(
        INVENTORY_CONTAINERS_QUERY_KEYS.container(input.id)
      )
      return { container }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.container) {
        queryCache.setQueryData(
          INVENTORY_CONTAINERS_QUERY_KEYS.container(input.id),
          context.container
        )
      }
      showError(error.message, 'Container could not be updated')
    },
    onSuccess() {
      showSuccess('Container updated successfully.', 'Container updated')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.container(input.id),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
    }
  })
  return { updateContainer: mutate, ...mutation }
})

export const moveContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveContainerSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.moveContainer.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Container could not be moved')
    },
    onSuccess() {
      showSuccess('Container moved successfully.', 'Container moved')
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
    }
  })
  return { moveContainer: mutate, ...mutation }
})

export const deleteContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteContainerInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.deleteContainer.mutate({ id: input.id, rev: input.rev })
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      if (input.parentId) {
        const byParent = queryCache.getQueryData<Container[]>(
          INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId)
        ) || []
        queryCache.cancelQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId),
          byParent.filter(c => c._id !== input.id)
        )
        return { byParent, parentId: input.parentId }
      }
      return { byParent: undefined, parentId: undefined }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      if (context.parentId && context.byParent) {
        queryCache.setQueryData(
          INVENTORY_CONTAINERS_QUERY_KEYS.byParent(context.parentId),
          context.byParent
        )
      }
      showError(error.message, 'Container could not be deleted')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Container${input.containerName ? ` "${input.containerName}"` : ''} deleted successfully.`,
        'Container deleted'
      )
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      if (input.parentId) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentId),
          exact: true
        })
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.contents(input.parentId),
          exact: true
        })
      }
      queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
    }
  })
  return { deleteContainer: mutate, ...mutation }
})
