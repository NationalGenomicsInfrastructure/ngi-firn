import { defineQueryOptions } from '@pinia/colada'
import type { DisplayTaskActivation } from '~~/types/productivity'
import { TASKS_QUERY_KEYS } from '~/utils/queries/tasks/tasks'

// Every activation of a task
export const taskActivationsQuery = defineQueryOptions(
  (taskSlug: string) => ({
    key: TASKS_QUERY_KEYS.activations(taskSlug),
    query: (): Promise<DisplayTaskActivation[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.activations.list.query({ taskSlug })
    }
  })
)

// One activation of a task
export const taskActivationQuery = defineQueryOptions(
  ({ taskSlug, activationId }: { taskSlug: string, activationId: string }) => ({
    key: TASKS_QUERY_KEYS.activation(taskSlug, activationId),
    query: (): Promise<DisplayTaskActivation> => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.activations.get.query({ taskSlug, activationId })
    }
  })
)
