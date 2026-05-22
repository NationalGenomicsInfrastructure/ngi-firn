import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { InventoryTask } from '~~/types/inventory'
import type {
  CreateTaskSchemaInput,
  CompleteTaskSchemaInput,
  SkipTaskSchemaInput,
  CancelTaskSchemaInput,
  CreateExpiryTasksSchemaInput
} from '~~/schemas/inventory-tasks'
import { INVENTORY_TASKS_QUERY_KEYS } from '~/utils/queries/inventory/tasks'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'

const { showSuccess, showError } = useFirnToast()

// Task creation

export const createTask = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateTaskSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.createTask.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Task could not be created')
    },
    onSuccess() {
      showSuccess('Task created successfully.', 'Task created')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_TASKS_QUERY_KEYS.forTarget(input.targetId),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { createTask: mutate, ...mutation }
})

// Task lifecycle mutations

export const completeTask = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CompleteTaskSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.completeTask.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const task = queryCache.getQueryData<InventoryTask>(
        INVENTORY_TASKS_QUERY_KEYS.task(input.taskId)
      )
      if (task) {
        queryCache.cancelQueries({
          key: INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          { ...task, status: 'completed' }
        )
      }
      return { task }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.task) {
        queryCache.setQueryData(
          INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          context.task
        )
      }
      showError(error.message, 'Task could not be completed')
    },
    onSuccess() {
      showSuccess('Task completed successfully.', 'Task completed')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
    }
  })
  return { completeTask: mutate, ...mutation }
})

export const skipTask = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: SkipTaskSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.skipTask.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const task = queryCache.getQueryData<InventoryTask>(
        INVENTORY_TASKS_QUERY_KEYS.task(input.taskId)
      )
      if (task) {
        queryCache.cancelQueries({
          key: INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          { ...task, status: 'skipped' }
        )
      }
      return { task }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.task) {
        queryCache.setQueryData(
          INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          context.task
        )
      }
      showError(error.message, 'Task could not be skipped')
    },
    onSuccess() {
      showSuccess('Task skipped successfully.', 'Task skipped')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { skipTask: mutate, ...mutation }
})

export const cancelTask = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CancelTaskSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.cancelTask.mutate(input)
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const task = queryCache.getQueryData<InventoryTask>(
        INVENTORY_TASKS_QUERY_KEYS.task(input.taskId)
      )
      if (task) {
        queryCache.cancelQueries({
          key: INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          exact: true
        })
        queryCache.setQueryData(
          INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          { ...task, status: 'cancelled' }
        )
      }
      return { task }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.task) {
        queryCache.setQueryData(
          INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
          context.task
        )
      }
      showError(error.message, 'Task could not be cancelled')
    },
    onSuccess() {
      showSuccess('Task cancelled successfully.', 'Task cancelled')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_TASKS_QUERY_KEYS.task(input.taskId),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { cancelTask: mutate, ...mutation }
})

// Bulk task creation

export const createExpiryTasks = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateExpiryTasksSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.createExpiryTasks.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Expiry tasks could not be created')
    },
    onSuccess(response) {
      const count = Array.isArray(response) ? response.length : 0
      showSuccess(
        `${count} expiry task${count === 1 ? '' : 's'} created successfully.`,
        'Expiry tasks created'
      )
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_TASKS_QUERY_KEYS.root })
    }
  })
  return { createExpiryTasks: mutate, ...mutation }
})
