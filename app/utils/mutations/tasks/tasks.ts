import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type {
  CreateTaskSchemaInput,
  SetSharingSchemaInput,
  TaskBySlugSchemaInput,
  TransferOwnershipSchemaInput,
  UpdateTaskMetadataSchemaInput
} from '~~/schemas/tasks/tasks'
import type { DisplayTask } from '~~/types/productivity'
import { TASKS_QUERY_KEYS } from '~/utils/queries/tasks/tasks'
import { applyTask, isConflictError } from '~/utils/mutations/tasks/cache'

/*
 * Mutations of the task aggregate (tasks.* procedures).
 *
 * Only updateTaskMetadata is optimistic. Sharing, lifecycle and responsibility changes are
 * server-confirmed: the server checks them against live activations and policies, so the cache
 * is written from the response instead of being guessed.
 */

type TaskScoped<T> = T & { taskSlug: string }

type TaskDetailContext = { previous: DisplayTask | undefined }

const { showSuccess, showError, showWarning } = useFirnToast()

export const createTask = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateTaskSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.create.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Task could not be created')
    },
    onSuccess(task) {
      applyTask(task)
      showSuccess(`Task "${task.title}" has been created.`, 'Task created')
    }
  })
  return { createTask: mutate, ...mutation }
})

export const updateTaskMetadata = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<UpdateTaskMetadataSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.updateMetadata.mutate(input)
    },
    onMutate({ taskSlug, expectedEditVersion: _version, ...patch }): TaskDetailContext {
      const queryCache = useQueryCache()
      const key = TASKS_QUERY_KEYS.detail(taskSlug)
      const previous = queryCache.getQueryData<DisplayTask>(key)
      if (previous) {
        const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
        queryCache.cancelQueries({ key, exact: true })
        queryCache.setQueryData(key, { ...previous, ...defined })
      }
      return { previous }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.previous) queryCache.setQueryData(TASKS_QUERY_KEYS.detail(input.taskSlug), context.previous)
      if (isConflictError(error)) {
        queryCache.invalidateQueries({ key: TASKS_QUERY_KEYS.detail(input.taskSlug), exact: true })
        showWarning('A colleague edited this task in the meantime. It has been reloaded; please apply your change again.', 'Task changed')
        return
      }
      showError(error.message, 'Task could not be updated')
    },
    onSuccess(task) {
      applyTask(task)
      showSuccess(`Task "${task.title}" has been updated.`, 'Task updated')
    }
  })
  /*
   * Pass `expectedEditVersion` as the task's editVersion at the moment the user started editing
   * (captured by the form). It is not defaulted from the cache: a refetch during editing would
   * silently accept a colleague's change, and a second quick save would conflict with the first.
   */
  return { updateTaskMetadata: mutate, ...mutation }
})

export const setTaskSharing = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<SetSharingSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.setSharing.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Sharing could not be changed')
    },
    onSuccess(task) {
      showSuccess(`Sharing of "${task.title}" has been updated.`, 'Sharing updated')
    },
    onSettled(task, _error, input) {
      // Membership decides which listings contain the task, and the caller may have lost access.
      if (task) applyTask(task)
      else useQueryCache().invalidateQueries({ key: TASKS_QUERY_KEYS.detail(input.taskSlug), exact: true })
    }
  })
  return { setTaskSharing: mutate, ...mutation }
})

export const transferTaskOwnership = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: TaskScoped<TransferOwnershipSchemaInput>) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks.transferOwnership.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Ownership could not be transferred')
    },
    onSuccess(task) {
      applyTask(task)
      const owner = task.managingOwner.kind === 'user' ? task.managingOwner.user.name : 'a new owner'
      showSuccess(`"${task.title}" is now managed by ${owner}.`, 'Ownership transferred')
    }
  })
  return { transferTaskOwnership: mutate, ...mutation }
})

/*
 * Lifecycle and responsibility mutations share one shape: { taskSlug } in, DisplayTask out.
 * Cancelling also cancels the task's planned steps, so its checklist is refreshed too.
 */
function defineTaskTransition(
  procedure: 'publish' | 'archive' | 'cancel' | 'claim' | 'releaseResponsibility',
  messages: { success: (task: DisplayTask) => string, successTitle: string, errorTitle: string },
  refreshSteps = false
) {
  return () => useMutation({
    mutation: (input: TaskBySlugSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tasks[procedure].mutate(input)
    },
    onError(error: Error) {
      showError(error.message, messages.errorTitle)
    },
    onSuccess(task) {
      applyTask(task)
      showSuccess(messages.success(task), messages.successTitle)
    },
    onSettled(_task, _error, input) {
      if (refreshSteps) useQueryCache().invalidateQueries({ key: TASKS_QUERY_KEYS.steps(input.taskSlug), exact: true })
    }
  })
}

const usePublishTask = defineTaskTransition('publish', {
  success: task => `Task "${task.title}" has been published.`,
  successTitle: 'Task published',
  errorTitle: 'Task could not be published'
})

export const publishTask = defineMutation(() => {
  const { mutate, ...mutation } = usePublishTask()
  return { publishTask: mutate, ...mutation }
})

const useArchiveTask = defineTaskTransition('archive', {
  success: task => `Task "${task.title}" has been archived.`,
  successTitle: 'Task archived',
  errorTitle: 'Task could not be archived'
})

export const archiveTask = defineMutation(() => {
  const { mutate, ...mutation } = useArchiveTask()
  return { archiveTask: mutate, ...mutation }
})

const useCancelTask = defineTaskTransition('cancel', {
  success: task => `Task "${task.title}" has been cancelled.`,
  successTitle: 'Task cancelled',
  errorTitle: 'Task could not be cancelled'
}, true)

export const cancelTask = defineMutation(() => {
  const { mutate, ...mutation } = useCancelTask()
  return { cancelTask: mutate, ...mutation }
})

const useClaimTask = defineTaskTransition('claim', {
  success: task => `You are now responsible for "${task.title}".`,
  successTitle: 'Task claimed',
  errorTitle: 'Task could not be claimed'
})

export const claimTask = defineMutation(() => {
  const { mutate, ...mutation } = useClaimTask()
  return { claimTask: mutate, ...mutation }
})

const useReleaseTaskResponsibility = defineTaskTransition('releaseResponsibility', {
  success: task => `You are no longer responsible for "${task.title}".`,
  successTitle: 'Responsibility released',
  errorTitle: 'Responsibility could not be released'
})

export const releaseTaskResponsibility = defineMutation(() => {
  const { mutate, ...mutation } = useReleaseTaskResponsibility()
  return { releaseTaskResponsibility: mutate, ...mutation }
})
