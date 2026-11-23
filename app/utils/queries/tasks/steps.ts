import { defineQueryOptions } from '@pinia/colada'
import type { DisplayTaskStep } from '~~/types/productivity'
import { TASKS_QUERY_KEYS } from '~/utils/queries/tasks/tasks'

// Every step of a task in checklist order
export const taskStepsQuery = defineQueryOptions(
  (taskSlug: string) => ({
    key: TASKS_QUERY_KEYS.steps(taskSlug),
    query: (): Promise<DisplayTaskStep[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.steps.list.query({ taskSlug })
    }
  })
)
