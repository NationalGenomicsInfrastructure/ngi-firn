import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type {
  AddStepsSchemaInput,
  RemovePlannedStepSchemaInput,
  ReorderStepsSchemaInput,
  SetStepDependenciesSchemaInput,
  UpdatePlannedStepSchemaInput
} from '~~/schemas/tasks/steps'
import type { DisplayTaskStep } from '~~/types/productivity'
import { TASKS_QUERY_KEYS } from '~/utils/queries/tasks/tasks'
import { invalidateTaskWork, upsertSteps } from '~/utils/mutations/tasks/cache'

/*
 * Mutations planning a task's checklist (tasks.steps.* procedures).
 *
 * Planning never touches inventory: holds are only placed at activation. Removing and reordering
 * planned steps are optimistic (cheap, purely local, fully reversible); adding and editing are
 * server-confirmed, because the server resolves the inventory references and display snapshots.
 * Every mutation refreshes the task detail and listings, whose progress is derived from steps.
 */

type TaskScoped<T> = T & { taskSlug: string }

type StepsContext = { previous: DisplayTaskStep[] | undefined }

const { showSuccess, showError } = useFirnToast()

function snapshotAndSetSteps(taskSlug: string, update: (steps: DisplayTaskStep[]) => DisplayTaskStep[]): StepsContext {
  const queryCache = useQueryCache()
  const key = TASKS_QUERY_KEYS.steps(taskSlug)
  const previous = queryCache.getQueryData<DisplayTaskStep[]>(key)
  if (previous) {
    queryCache.cancelQueries({ key, exact: true })
    queryCache.setQueryData(key, update(previous))
  }
  return { previous }
}

function restoreSteps(taskSlug: string, context: Partial<StepsContext> | undefined): void {
  if (context?.previous) useQueryCache().setQueryData(TASKS_QUERY_KEYS.steps(taskSlug), context.previous)
}

export const addTaskSteps = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<AddStepsSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.steps.add.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Steps could not be added')
    },
    onSuccess(steps, input) {
      upsertSteps(input.taskSlug, steps)
      showSuccess(steps.length === 1 ? 'One step has been added.' : `${steps.length} steps have been added.`, 'Steps added')
    },
    onSettled(_steps, _error, input) {
      invalidateTaskWork(input.taskSlug)
    }
  })
  return { addTaskSteps: mutate, ...mutation }
})

export const updateTaskStep = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<UpdatePlannedStepSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.steps.update.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Step could not be updated')
    },
    onSuccess(step, input) {
      upsertSteps(input.taskSlug, [step])
      showSuccess('The step has been updated.', 'Step updated')
    },
    onSettled(_step, _error, input) {
      invalidateTaskWork(input.taskSlug)
    }
  })
  return { updateTaskStep: mutate, ...mutation }
})

export const setTaskStepDependencies = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<SetStepDependenciesSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.steps.setDependencies.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Prerequisites could not be changed')
    },
    onSuccess(step, input) {
      upsertSteps(input.taskSlug, [step])
      showSuccess('The prerequisites of the step have been updated.', 'Prerequisites updated')
    },
    onSettled(_step, _error, input) {
      invalidateTaskWork(input.taskSlug)
    }
  })
  return { setTaskStepDependencies: mutate, ...mutation }
})

export const removeTaskStep = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<RemovePlannedStepSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.steps.remove.mutate(input)
    },
    onMutate(input): StepsContext {
      return snapshotAndSetSteps(input.taskSlug, steps => steps.filter(step => step.stepId !== input.stepId))
    },
    onError(error: Error, input, context) {
      restoreSteps(input.taskSlug, context)
      showError(error.message, 'Step could not be removed')
    },
    onSuccess() {
      showSuccess('The step has been removed.', 'Step removed')
    },
    onSettled(_result, _error, input) {
      invalidateTaskWork(input.taskSlug)
    }
  })
  return { removeTaskStep: mutate, ...mutation }
})

export const reorderTaskSteps = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<ReorderStepsSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.steps.reorder.mutate(input)
    },
    onMutate(input): StepsContext {
      const position = new Map(input.orderedStepIds.map((stepId, index) => [stepId, index]))
      return snapshotAndSetSteps(input.taskSlug, steps => steps
        .map(step => ({ ...step, order: position.get(step.stepId) ?? step.order }))
        .sort((a, b) => a.order - b.order))
    },
    onError(error: Error, input, context) {
      restoreSteps(input.taskSlug, context)
      showError(error.message, 'Steps could not be reordered')
    },
    onSuccess(steps, input) {
      // The server returns the whole checklist in its new order.
      const queryCache = useQueryCache()
      queryCache.cancelQueries({ key: TASKS_QUERY_KEYS.steps(input.taskSlug), exact: true })
      queryCache.setQueryData(TASKS_QUERY_KEYS.steps(input.taskSlug), steps)
    },
    onSettled(_steps, _error, input) {
      invalidateTaskWork(input.taskSlug)
    }
  })
  return { reorderTaskSteps: mutate, ...mutation }
})
