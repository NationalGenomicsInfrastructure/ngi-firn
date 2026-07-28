import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { DisplayContainer } from '~~/types/inventory'
import type { InventoryActionType, InventoryFlagType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import type {
  CreateContainerSchemaInput,
  UpdateContainerSchemaInput,
  DeleteContainerSchemaInput,
  MoveContainerSchemaInput,
  AlterContainerSchemaInput
} from '~~/schemas/inventory/container'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'

const { showSuccess, showError } = useFirnToast()

// Client-side status transition map for alter actions — mirrors the server-side
// statusFromAction() in logging.server.ts. Actions not listed here do not change status.
const STATUS_FROM_ACTION: Partial<Record<InventoryActionType, InventoryStatusType>> = {
  checkout: 'in_use',
  return: 'available',
  mark_expired: 'expired',
  dispose: 'disposed',
  post_missing: 'lost',
  reserve: 'reserved',
  unreserve: 'available'
}

// ---------------------------------------------------------------------------
// Extended input types — augment schema inputs with optional UI-only fields
// that are used for toasts and cache targeting but are never sent to the API.
// ---------------------------------------------------------------------------

type DeleteContainerMutationInput = DeleteContainerSchemaInput & {
  containerName?: string
  // Parent context needed to locate the relevant list cache for optimistic removal.
  parentSlug?: string
  parentKind?: 'equipment' | 'container'
}

type MoveContainerMutationInput = MoveContainerSchemaInput & {
  containerName?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/*
 * Resolve the correct parent list key from a parentRef carried by a DisplayContainer.
 * Used to target the right cache entry when the parent context is not known from input alone.
 */
function parentListKey(parentRef: DisplayContainer['parentRef']) {
  if (!parentRef) return null
  return parentRef.kind === 'equipment'
    ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(parentRef.slug)
    : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(parentRef.slug)
}

// ---------------------------------------------------------------------------
// Type aliases for onMutate context shapes — explicit return types ensure
// Pinia Colada correctly infers the context parameter in onError/onSettled.
// Without them, complex readonly tuple unions cause context to collapse to _EmptyObject.
// ---------------------------------------------------------------------------
type ContainerListContext = { parentList: DisplayContainer[], parentListCacheKey: readonly string[] | null }
type ContainerDetailContext = { container: DisplayContainer | undefined }
type ContainerDetailAndListContext = ContainerDetailContext & { parentList: DisplayContainer[], parentListCacheKey: readonly string[] | null }
type ContainerAlterContext = { snapshots: { slug: string, container: DisplayContainer | undefined }[] }

// ---------------------------------------------------------------------------
// createContainer
// ---------------------------------------------------------------------------

export const createContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateContainerSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.createContainer.mutate(input)
    },
    onMutate(input): ContainerListContext {
      const queryCache = useQueryCache()
      const parentListCacheKey: readonly string[] = input.parentKind === 'equipment'
        ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.parentSlug)
        : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentSlug)
      const parentList = queryCache.getQueryData<DisplayContainer[]>(parentListCacheKey) ?? []
      return { parentList, parentListCacheKey }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      if (context.parentListCacheKey) {
        queryCache.setQueryData(context.parentListCacheKey, context.parentList)
      }
      showError(error.message, 'Container could not be created')
    },
    onSuccess(response) {
      showSuccess(`Container "${response.name}" created successfully.`, 'Container created')
      navigateTo(`/inventory/containers/${encodeURIComponent(response.slug)}`)
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      const parentListCacheKey: readonly string[] = input.parentKind === 'equipment'
        ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.parentSlug)
        : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentSlug)
      queryCache.invalidateQueries({ key: parentListCacheKey, exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { createContainer: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// updateContainer
// ---------------------------------------------------------------------------

export const updateContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateContainerSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.updateContainer.mutate(input)
    },
    onMutate(input): ContainerDetailAndListContext {
      const queryCache = useQueryCache()
      const container = queryCache.getQueryData<DisplayContainer>(
        INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug)
      )
      const parentListCacheKey: readonly string[] | null = container ? parentListKey(container.parentRef) : null
      const parentList = parentListCacheKey
        ? queryCache.getQueryData<DisplayContainer[]>(parentListCacheKey) ?? []
        : []

      if (container) {
        queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug), {
          ...container,
          ...(input.name !== undefined && { name: input.name }),
          ...(input.label !== undefined && { label: input.label ?? null }),
          ...(input.description !== undefined && { description: input.description ?? null }),
          ...(input.containerType !== undefined && { containerType: input.containerType }),
          ...(input.classification !== undefined && { classification: input.classification })
        })
      }

      return { container, parentList, parentListCacheKey }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.container) {
        queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug), context.container)
      }
      if (context.parentListCacheKey) {
        queryCache.setQueryData(context.parentListCacheKey, context.parentList)
      }
      showError(error.message, 'Container could not be updated')
    },
    onSuccess(response) {
      showSuccess(`Container "${response.name}" updated successfully.`, 'Container updated')
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
        exact: true
      })
      // If the server assigned a new slug (name change), also invalidate the new key.
      if (data && data.slug !== input.containerSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(data.slug),
          exact: true
        })
      }
      // Re-fetch the parent list so the container name is up to date there too.
      const parentListCacheKey = data ? parentListKey(data.parentRef) : null
      if (parentListCacheKey) {
        queryCache.invalidateQueries({ key: parentListCacheKey, exact: true })
      }
    }
  })
  return { updateContainer: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// moveContainer
// ---------------------------------------------------------------------------

export const moveContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveContainerMutationInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.moveContainer.mutate({
        containerSlug: input.containerSlug,
        newParentSlug: input.newParentSlug,
        newParentKind: input.newParentKind,
        position: input.position,
        logComment: input.logComment
      })
    },
    onMutate(input): ContainerDetailAndListContext {
      const queryCache = useQueryCache()
      const container = queryCache.getQueryData<DisplayContainer>(
        INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug)
      )
      const oldParentListKey = container ? parentListKey(container.parentRef) : null
      const parentList = oldParentListKey
        ? queryCache.getQueryData<DisplayContainer[]>(oldParentListKey) ?? []
        : []
      return { container, parentList, parentListCacheKey: oldParentListKey }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.container) {
        queryCache.setQueryData(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
          context.container
        )
      }
      if (context.parentListCacheKey) {
        queryCache.setQueryData(context.parentListCacheKey, context.parentList)
      }
      showError(error.message, 'Container could not be moved')
    },
    onSuccess(response, input) {
      const containerLabel = input.containerName ?? response.name
      showSuccess(`Container "${containerLabel}" moved successfully.`, 'Container moved')
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
        exact: true
      })
      const newParentListKey: readonly string[] = input.newParentKind === 'equipment'
        ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.newParentSlug)
        : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.newParentSlug)
      queryCache.invalidateQueries({ key: newParentListKey, exact: true })
      // Invalidate the whole containers root to cover the old parent list whose key
      // we captured in onMutate context (not accessible in onSettled without context).
      if (data) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
      }
    }
  })
  return { moveContainer: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// alterContainer
// ---------------------------------------------------------------------------

export const alterContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: AlterContainerSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.alterContainer.mutate(input)
    },
    onMutate(input): ContainerAlterContext {
      const queryCache = useQueryCache()
      const optimisticStatus = STATUS_FROM_ACTION[input.performedAction]

      const snapshots = input.containerSlug.map((slug) => {
        const container = queryCache.getQueryData<DisplayContainer>(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug)
        )
        if (container) {
          const updatedFlags: InventoryFlagType[] | null
            = input.performedAction === 'flag' && input.flagKind
              ? [...(container.activeFlags ?? []), input.flagKind as InventoryFlagType]
              : input.performedAction === 'unflag' && input.flagKind
                ? (container.activeFlags ?? []).filter(f => f !== input.flagKind) || null
                : container.activeFlags

          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), {
            ...container,
            ...(optimisticStatus !== undefined && { status: optimisticStatus }),
            activeFlags: updatedFlags && updatedFlags.length > 0 ? updatedFlags : null
          })
        }
        return { slug, container }
      })
      return { snapshots }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      for (const { slug, container } of context.snapshots ?? []) {
        if (container) {
          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), container)
        }
      }
      showError(error.message, 'Container action could not be performed')
    },
    onSuccess(_data, input) {
      const count = input.containerSlug.length
      showSuccess(
        count === 1
          ? `Action "${input.performedAction}" applied successfully.`
          : `Action "${input.performedAction}" applied to ${count} containers.`,
        'Action applied'
      )
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      for (const slug of input.containerSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug),
          exact: true
        })
      }
    }
  })
  return { alterContainer: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// addProjectRef
// ---------------------------------------------------------------------------

export const addProjectRef = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: { containerSlug: string, projectId: string }) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.addProjectRef.mutate(input)
    },
    onMutate(input): ContainerDetailContext {
      const queryCache = useQueryCache()
      const container = queryCache.getQueryData<DisplayContainer>(
        INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug)
      )
      if (container) {
        queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug), {
          ...container,
          projectRefs: [
            ...(container.projectRefs ?? []),
            { slug: input.projectId, name: input.projectId, kind: 'project' as const }
          ]
        })
      }
      return { container }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.container) {
        queryCache.setQueryData(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
          context.container
        )
      }
      showError(error.message, 'Project reference could not be added')
    },
    onSuccess(_response, input) {
      showSuccess(`Project "${input.projectId}" linked successfully.`, 'Project linked')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
        exact: true
      })
      // projectRefs sub-key is nested under detailBySlug, so it is invalidated above.
      // Explicitly invalidate the dedicated query too in case it was loaded.
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.projectRefs(input.containerSlug),
        exact: true
      })
    }
  })
  return { addProjectRef: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// removeProjectRef
// ---------------------------------------------------------------------------

export const removeProjectRef = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: { containerSlug: string, projectId: string }) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.removeProjectRef.mutate(input)
    },
    onMutate(input): ContainerDetailContext {
      const queryCache = useQueryCache()
      const container = queryCache.getQueryData<DisplayContainer>(
        INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug)
      )
      if (container) {
        const updated = (container.projectRefs ?? []).filter(r => r.slug !== input.projectId)
        queryCache.cancelQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
          exact: true
        })
        queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug), {
          ...container,
          projectRefs: updated.length > 0 ? updated : null
        })
      }
      return { container }
    },
    onError(error: Error, input, context) {
      const queryCache = useQueryCache()
      if (context.container) {
        queryCache.setQueryData(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
          context.container
        )
      }
      showError(error.message, 'Project reference could not be removed')
    },
    onSuccess(_response, input) {
      showSuccess(`Project "${input.projectId}" unlinked successfully.`, 'Project unlinked')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
        exact: true
      })
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.projectRefs(input.containerSlug),
        exact: true
      })
    }
  })
  return { removeProjectRef: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// deleteContainer
// ---------------------------------------------------------------------------

export const deleteContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteContainerMutationInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.deleteContainer.mutate({ containerSlug: input.containerSlug })
    },
    onMutate(input): ContainerListContext {
      const queryCache = useQueryCache()
      let parentListCacheKey: readonly string[] | null = null
      if (input.parentSlug && input.parentKind) {
        parentListCacheKey = input.parentKind === 'equipment'
          ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.parentSlug)
          : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentSlug)
      }
      else {
        const detail = queryCache.getQueryData<DisplayContainer>(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug)
        )
        parentListCacheKey = detail ? parentListKey(detail.parentRef) : null
      }

      const parentList = parentListCacheKey
        ? queryCache.getQueryData<DisplayContainer[]>(parentListCacheKey) ?? []
        : []

      if (parentListCacheKey) {
        queryCache.cancelQueries({ key: parentListCacheKey, exact: true })
        queryCache.setQueryData(
          parentListCacheKey,
          parentList.filter(c => c.slug !== input.containerSlug)
        )
      }

      return { parentList, parentListCacheKey }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      if (context.parentListCacheKey) {
        queryCache.setQueryData(context.parentListCacheKey, context.parentList)
      }
      showError(error.message, 'Container could not be deleted')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Container${input.containerName ? ` "${input.containerName}"` : ''} deleted successfully.`,
        'Container deleted'
      )
      navigateTo('/inventory/containers')
    },
    onSettled(_data, _error, input, context) {
      const queryCache = useQueryCache()
      if (context?.parentListCacheKey) {
        queryCache.invalidateQueries({ key: context.parentListCacheKey, exact: true })
      }
      queryCache.invalidateQueries({
        key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.containerSlug),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { deleteContainer: mutate, ...mutation }
})
