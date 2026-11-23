import { defineQueryOptions } from '@pinia/colada'
import type { TaskListOptions } from '~~/schemas/tasks/common'
import type { ListTasksByInventorySchemaInput, ListTasksByProjectSchemaInput } from '~~/schemas/tasks/tasks'
import type { TaskListResult } from '~~/server/crud/tasks/tasks.server'
import type { DisplayTask } from '~~/types/productivity'

/*
 * Key factory of the tasks domain, shared by the task, step and activation query/mutation files.
 *
 * Hierarchy:
 *   ['tasks', 'list', …]                    every listing (mine, pool, by project, by inventory)
 *   ['tasks', 'detail', slug]               one task
 *   ['tasks', 'detail', slug, 'steps']      its checklist
 *   ['tasks', 'detail', slug, 'activations' (, activationId)]
 *
 * Invalidation only cascades downward: invalidating detail(slug) refreshes its steps and
 * activations, but a step or activation change must invalidate detail(slug) and lists() itself,
 * because a task's progress and status are derived from its steps. Listing options are kept as
 * plain objects (never JSON.stringify) so key filters can match them partially.
 */
export const TASKS_QUERY_KEYS = {
  root: ['tasks'] as const,
  lists: () => [...TASKS_QUERY_KEYS.root, 'list'] as const,
  list: (options?: TaskListOptions) => [...TASKS_QUERY_KEYS.lists(), 'mine', options ?? {}] as const,
  pool: (options?: TaskListOptions) => [...TASKS_QUERY_KEYS.lists(), 'pool', options ?? {}] as const,
  byProject: (projectId: string, options?: TaskListOptions) =>
    [...TASKS_QUERY_KEYS.lists(), 'project', projectId, options ?? {}] as const,
  byInventory: (kind: ListTasksByInventorySchemaInput['kind'], slug: string, options?: TaskListOptions) =>
    [...TASKS_QUERY_KEYS.lists(), 'inventory', kind, slug, options ?? {}] as const,
  detail: (taskSlug: string) => [...TASKS_QUERY_KEYS.root, 'detail', taskSlug] as const,
  steps: (taskSlug: string) => [...TASKS_QUERY_KEYS.detail(taskSlug), 'steps'] as const,
  activations: (taskSlug: string) => [...TASKS_QUERY_KEYS.detail(taskSlug), 'activations'] as const,
  activation: (taskSlug: string, activationId: string) =>
    [...TASKS_QUERY_KEYS.activations(taskSlug), activationId] as const
} as const

export type TaskListQueryResult = TaskListResult

// Tasks the current user can see (owned, responsible, viewer or public)
export const tasksQuery = defineQueryOptions(
  (options?: TaskListOptions) => ({
    key: TASKS_QUERY_KEYS.list(options),
    query: (): Promise<TaskListResult> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.list.query(options ?? {})
    }
  })
)

// Public, open, unassigned tasks available for claiming
export const taskPoolQuery = defineQueryOptions(
  (options?: TaskListOptions) => ({
    key: TASKS_QUERY_KEYS.pool(options),
    query: (): Promise<TaskListResult> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.listPool.query(options ?? {})
    }
  })
)

// Tasks linked to a project (LIMS project id)
export const tasksByProjectQuery = defineQueryOptions(
  ({ projectId, ...options }: ListTasksByProjectSchemaInput) => ({
    key: TASKS_QUERY_KEYS.byProject(projectId, options),
    query: (): Promise<TaskListResult> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.listByProject.query({ projectId, ...options })
    }
  })
)

// Tasks linked to an inventory object (kind + slug)
export const tasksByInventoryQuery = defineQueryOptions(
  ({ kind, slug, ...options }: ListTasksByInventorySchemaInput) => ({
    key: TASKS_QUERY_KEYS.byInventory(kind, slug, options),
    query: (): Promise<TaskListResult> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.listByInventory.query({ kind, slug, ...options })
    }
  })
)

// One task by slug
export const taskQuery = defineQueryOptions(
  (taskSlug: string) => ({
    key: TASKS_QUERY_KEYS.detail(taskSlug),
    query: (): Promise<DisplayTask> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.getBySlug.query({ taskSlug })
    }
  })
)
