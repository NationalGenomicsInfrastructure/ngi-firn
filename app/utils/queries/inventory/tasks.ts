import type { z } from 'zod'
import type { InventoryTask } from '~~/types/inventory'
import type { inventoryActionTypeSchema } from '~~/schemas/inventory-common'
import { defineQueryOptions } from '@pinia/colada'

type InventoryActionType = z.infer<typeof inventoryActionTypeSchema>

// Key factory for inventory tasks domain
export const INVENTORY_TASKS_QUERY_KEYS = {
  root: ['inventory', 'tasks'] as const,
  task: (taskId: string) => [...INVENTORY_TASKS_QUERY_KEYS.root, 'task', taskId] as const,
  forTarget: (targetId: string) => [...INVENTORY_TASKS_QUERY_KEYS.root, 'forTarget', targetId] as const,
  planned: (params: Record<string, unknown>) => [...INVENTORY_TASKS_QUERY_KEYS.root, 'planned', params] as const,
  overdue: () => [...INVENTORY_TASKS_QUERY_KEYS.root, 'overdue'] as const
} as const

// Query for a single task by ID
export const taskQuery = defineQueryOptions(
  (taskId: string) => ({
    key: INVENTORY_TASKS_QUERY_KEYS.task(taskId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.getTask.query({ taskId })
    }
  })
)

// Query for tasks targeting a specific entity
export const tasksForTargetQuery = defineQueryOptions(
  (params: { targetId: string, limit?: number }) => ({
    key: INVENTORY_TASKS_QUERY_KEYS.forTarget(params.targetId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.getTasksForTarget.query(params)
    }
  })
)

// Query for planned tasks with optional filters
export const plannedTasksQuery = defineQueryOptions(
  (params: {
    assignedTo?: string
    targetId?: string
    actionType?: InventoryActionType
    overdueBefore?: string
  }) => ({
    key: INVENTORY_TASKS_QUERY_KEYS.planned({ ...params }),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.tasks.getPlannedTasks.query(params)
    }
  })
)

// Query for all overdue tasks
export const overdueTasksQuery = defineQueryOptions<InventoryTask[]>({
  key: INVENTORY_TASKS_QUERY_KEYS.overdue(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.tasks.getOverdueTasks.query()
  }
})
