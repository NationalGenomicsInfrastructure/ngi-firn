import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { DisplayContainer, InventoryActiveFlag } from '~~/types/inventory'
import type { InventoryActionType, InventoryFlagType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import { isVacatingAction } from '~~/schemas/inventory/metadata'
import type {
  CreateContainerSchemaInput,
  UpdateContainerSchemaInput,
  DeleteContainerSchemaInput,
  MoveContainerSchemaInput,
  LocateContainerSchemaInput,
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
  // UI-only labels for toasts; never sent to the API.
  containerNames?: string[]
  // Per-container parent context, used to locate the relevant list caches for optimistic removal.
  parents?: { slug: string, kind: 'equipment' | 'container' }[]
}

type MoveContainerMutationInput = MoveContainerSchemaInput & {
  containerNames?: string[]
}

type LocateContainerMutationInput = LocateContainerSchemaInput & {
  // UI-only labels for toasts; never sent to the API.
  containerNames?: string[]
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

/*
 * Optimistically add or update an active flag, keyed by category — mirrors the server's
 * alterContainer behaviour (re-flagging the same category overwrites its comment).
 */
function upsertActiveFlag(
  current: InventoryActiveFlag[] | null,
  kind: InventoryFlagType,
  comment: string | null
): InventoryActiveFlag[] {
  const flags = current ?? []
  return flags.some(flag => flag.kind === kind)
    ? flags.map(flag => flag.kind === kind ? { kind, comment } : flag)
    : [...flags, { kind, comment }]
}

// ---------------------------------------------------------------------------
// Type aliases for onMutate context shapes — explicit return types ensure
// Pinia Colada correctly infers the context parameter in onError/onSettled.
// Without them, complex readonly tuple unions cause context to collapse to _EmptyObject.
// ---------------------------------------------------------------------------
type ContainerListContext = { parentList: DisplayContainer[], parentListCacheKey: readonly string[] | null }
type ContainerDetailContext = { container: DisplayContainer | undefined }
type ContainerDetailAndListContext = ContainerDetailContext & { parentList: DisplayContainer[], parentListCacheKey: readonly string[] | null }
type ContainerAlterContext = {
  snapshots: { slug: string, container: DisplayContainer | undefined }[]
  // For vacating actions (dispose/post_missing): snapshots of every parent/overview list
  // touched, plus the former parent slugs, so the cache can be rolled back and reconciled.
  listSnapshots: { key: readonly string[], list: DisplayContainer[] }[]
  parentSlugs: string[]
}
// Batch delete: snapshots of every parent list cache touched, for rollback on error.
type ContainerListSnapshotContext = { snapshots: { key: readonly string[], list: DisplayContainer[] }[] }
// Batch move: per-container detail snapshots plus the old parent lists they belonged to.
type ContainerMoveContext = {
  details: { slug: string, container: DisplayContainer | undefined }[]
  listSnapshots: { key: readonly string[], list: DisplayContainer[] }[]
}

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
      navigateTo(`/inventory/containers/${encodeURIComponent(response.slug)}/details`)
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      const parentListCacheKey: readonly string[] = input.parentKind === 'equipment'
        ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.parentSlug)
        : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.parentSlug)
      queryCache.invalidateQueries({ key: parentListCacheKey, exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
      // The parent container's stored occupancy changed → refresh its capacity bars.
      if (input.parentKind === 'container') {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(input.parentSlug), exact: true })
      }
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
      navigateTo(`/inventory/containers/${encodeURIComponent(response.slug)}/details`)
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
      // The container's own capacity limits may have changed → refresh its capacity bars.
      queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(input.containerSlug), exact: true })
      if (data && data.slug !== input.containerSlug) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(data.slug), exact: true })
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
    onMutate(input): ContainerMoveContext {
      const queryCache = useQueryCache()
      const details: { slug: string, container: DisplayContainer | undefined }[] = []
      const listKeys = new Map<string, readonly string[]>()

      for (const slug of input.containerSlug) {
        const container = queryCache.getQueryData<DisplayContainer>(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug)
        )
        details.push({ slug, container })
        const key = container ? parentListKey(container.parentRef) : null
        if (key) listKeys.set(key.join('\u0000'), key)
      }

      const listSnapshots = [...listKeys.values()].map(key => ({
        key,
        list: queryCache.getQueryData<DisplayContainer[]>(key) ?? []
      }))

      return { details, listSnapshots }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      for (const { slug, container } of context.details ?? []) {
        if (container) {
          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), container)
        }
      }
      for (const { key, list } of context.listSnapshots ?? []) {
        queryCache.setQueryData(key, list)
      }
      showError(error.message, 'Container could not be moved')
    },
    onSuccess(response, input) {
      const count = response.length
      const containerLabel = input.containerNames?.[0] ?? response[0]?.name ?? ''
      showSuccess(
        count === 1
          ? `Container "${containerLabel}" moved successfully.`
          : `${count} containers moved successfully.`,
        'Container moved'
      )
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      for (const slug of input.containerSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug),
          exact: true
        })
      }
      const newParentListKey: readonly string[] = input.newParentKind === 'equipment'
        ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.newParentSlug)
        : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.newParentSlug)
      queryCache.invalidateQueries({ key: newParentListKey, exact: true })
      // Invalidate the whole containers root to cover the old parent lists whose keys
      // we captured in onMutate context (not accessible in onSettled without context).
      if (data) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
      }
    }
  })
  return { moveContainer: mutate, ...mutation }
})

// ---------------------------------------------------------------------------
// locateContainer — re-place LOST containers (lost -> available)
// ---------------------------------------------------------------------------

export const locateContainer = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: LocateContainerMutationInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.locateContainer.mutate({
        containerSlug: input.containerSlug,
        newParentSlug: input.newParentSlug,
        newParentKind: input.newParentKind,
        position: input.position,
        logComment: input.logComment
      })
    },
    onMutate(input): ContainerAlterContext {
      const queryCache = useQueryCache()
      const slugSet = new Set(input.containerSlug)

      // Optimistically flip status to available in the detail caches. The destination parent
      // may be auto-selected server-side, so placement (parentRef) is reconciled on settle.
      const snapshots = input.containerSlug.map((slug) => {
        const container = queryCache.getQueryData<DisplayContainer>(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug)
        )
        if (container) {
          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), {
            ...container,
            status: 'available' as InventoryStatusType
          })
        }
        return { slug, container }
      })

      const listSnapshots: { key: readonly string[], list: DisplayContainer[] }[] = []
      const allKey = INVENTORY_CONTAINERS_QUERY_KEYS.all()
      const allList = queryCache.getQueryData<DisplayContainer[]>(allKey)
      if (allList) {
        listSnapshots.push({ key: allKey, list: allList })
        queryCache.setQueryData(allKey, allList.map(c => slugSet.has(c.slug)
          ? { ...c, status: 'available' as InventoryStatusType }
          : c))
      }

      return { snapshots, listSnapshots, parentSlugs: [] }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      for (const { slug, container } of context.snapshots ?? []) {
        if (container) {
          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), container)
        }
      }
      for (const { key, list } of context.listSnapshots ?? []) {
        queryCache.setQueryData(key, list)
      }
      showError(error.message, 'Container could not be located')
    },
    onSuccess(response, input) {
      const count = response.length
      const containerLabel = input.containerNames?.[0] ?? response[0]?.name ?? ''
      showSuccess(
        count === 1
          ? `Container "${containerLabel}" located and returned to storage.`
          : `${count} containers located and returned to storage.`,
        'Container located'
      )
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      for (const slug of input.containerSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug),
          exact: true
        })
      }
      if (input.newParentSlug && input.newParentKind) {
        const newParentListKey: readonly string[] = input.newParentKind === 'equipment'
          ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(input.newParentSlug)
          : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(input.newParentSlug)
        queryCache.invalidateQueries({ key: newParentListKey, exact: true })
      }
      // The destination (possibly auto-selected) and overview lists all change — invalidate
      // the whole containers root plus the dashboard counts.
      if (data) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
      }
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
    }
  })
  return { locateContainer: mutate, ...mutation }
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
      const vacating = isVacatingAction(input.performedAction)
      const slugSet = new Set(input.containerSlug)
      const parentSlugs: string[] = []

      const snapshots = input.containerSlug.map((slug) => {
        const container = queryCache.getQueryData<DisplayContainer>(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug)
        )
        if (container) {
          if (container.parentRef) parentSlugs.push(container.parentRef.slug)
          const updatedFlags: InventoryActiveFlag[] | null
            = input.performedAction === 'flag' && input.flagKind
              ? upsertActiveFlag(container.activeFlags, input.flagKind as InventoryFlagType, input.logComment ?? null)
              : input.performedAction === 'unflag' && input.flagKind
                ? (container.activeFlags ?? []).filter(f => f.kind !== input.flagKind) || null
                : container.activeFlags

          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), {
            ...container,
            ...(optimisticStatus !== undefined && { status: optimisticStatus }),
            // Vacating actions unplace the container: drop its placement in the cache too.
            ...(vacating && { parentRef: null, positionParent: null }),
            activeFlags: updatedFlags && updatedFlags.length > 0 ? updatedFlags : null
          })
        }
        return { slug, container }
      })

      // For vacating actions also reconcile the list caches: remove the containers from their
      // former parent lists (they no longer live there) and, in the flat overview, update the
      // entries in place (they stay listed but become unplaced with the new status).
      const listSnapshots: { key: readonly string[], list: DisplayContainer[] }[] = []
      if (vacating) {
        const listKeys = new Map<string, readonly string[]>()
        for (const { container } of snapshots) {
          const key = container ? parentListKey(container.parentRef) : null
          if (key) listKeys.set(key.join('\u0000'), key)
        }
        for (const key of listKeys.values()) {
          const list = queryCache.getQueryData<DisplayContainer[]>(key) ?? []
          listSnapshots.push({ key, list })
          queryCache.cancelQueries({ key, exact: true })
          queryCache.setQueryData(key, list.filter(c => !slugSet.has(c.slug)))
        }

        const allKey = INVENTORY_CONTAINERS_QUERY_KEYS.all()
        const allList = queryCache.getQueryData<DisplayContainer[]>(allKey)
        if (allList) {
          listSnapshots.push({ key: allKey, list: allList })
          queryCache.setQueryData(allKey, allList.map(c => slugSet.has(c.slug)
            ? { ...c, ...(optimisticStatus !== undefined && { status: optimisticStatus }), parentRef: null, positionParent: null }
            : c))
        }
      }

      return { snapshots, listSnapshots, parentSlugs }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      for (const { slug, container } of context.snapshots ?? []) {
        if (container) {
          queryCache.setQueryData(INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), container)
        }
      }
      for (const { key, list } of context.listSnapshots ?? []) {
        queryCache.setQueryData(key, list)
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
    onSettled(_data, _error, input, context) {
      const queryCache = useQueryCache()
      for (const slug of input.containerSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug),
          exact: true
        })
      }
      // Vacating actions changed parent occupancy and list membership — refresh the affected
      // parent lists, the flat overview, the former-parent details (capacity) and the counts.
      for (const { key } of context?.listSnapshots ?? []) {
        queryCache.invalidateQueries({ key, exact: true })
      }
      for (const parentSlug of new Set(context?.parentSlugs ?? [])) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(parentSlug),
          exact: true
        })
        // Vacating frees a slot on the former parent → refresh its capacity bars.
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(parentSlug),
          exact: true
        })
      }
      if (isVacatingAction(input.performedAction)) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.all(), exact: true })
        queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
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
    onMutate(input): ContainerListSnapshotContext {
      const queryCache = useQueryCache()
      const slugs = new Set(input.containerSlug)

      // Resolve every parent list cache touched by the batch: prefer explicit per-container
      // parent context, and fall back to each container's cached detail when absent.
      const listKeys = new Map<string, readonly string[]>()
      const addKey = (key: readonly string[] | null) => {
        if (key) listKeys.set(key.join('\u0000'), key)
      }
      for (const parent of input.parents ?? []) {
        addKey(parent.kind === 'equipment'
          ? INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(parent.slug)
          : INVENTORY_CONTAINERS_QUERY_KEYS.byParent(parent.slug))
      }
      for (const slug of input.containerSlug) {
        const detail = queryCache.getQueryData<DisplayContainer>(
          INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug)
        )
        if (detail) addKey(parentListKey(detail.parentRef))
      }

      const snapshots: { key: readonly string[], list: DisplayContainer[] }[] = []
      for (const key of listKeys.values()) {
        const list = queryCache.getQueryData<DisplayContainer[]>(key) ?? []
        snapshots.push({ key, list })
        queryCache.cancelQueries({ key, exact: true })
        queryCache.setQueryData(key, list.filter(c => !slugs.has(c.slug)))
      }

      return { snapshots }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      for (const { key, list } of context.snapshots ?? []) {
        queryCache.setQueryData(key, list)
      }
      showError(error.message, 'Container could not be deleted')
    },
    onSuccess(data, input, context: ContainerListSnapshotContext) {
      const queryCache = useQueryCache()
      const deletedCount = data.deleted.length
      const failedCount = data.failures.length

      // Best-effort delete resolves normally even on partial failure, so reconcile the
      // optimistic cache authoritatively: keep the containers the server actually deleted
      // removed, but restore the ones that failed (onMutate optimistically removed ALL).
      if (failedCount > 0) {
        const deletedSlugs = new Set(data.deleted.map(c => c.slug))
        for (const { key, list } of context.snapshots ?? []) {
          queryCache.setQueryData(key, list.filter(c => !deletedSlugs.has(c.slug)))
        }
      }

      if (deletedCount > 0) {
        showSuccess(
          deletedCount === 1
            ? `Container${input.containerNames?.[0] ? ` "${input.containerNames[0]}"` : ''} deleted successfully.`
            : `${deletedCount} containers deleted successfully.`,
          'Container deleted'
        )
      }
      if (failedCount > 0) {
        showError(
          data.failures.map(f => `${f.slug}: ${f.error}`).join('\n'),
          failedCount === 1 ? 'A container could not be deleted' : `${failedCount} containers could not be deleted`
        )
      }
      // Only navigate away when a single-container request (e.g. the detail-page button)
      // actually deleted that container.
      if (input.containerSlug.length === 1 && deletedCount === 1) {
        navigateTo('/inventory/containers')
      }
    },
    onSettled(_data, _error, input, context) {
      const queryCache = useQueryCache()
      for (const { key } of context?.snapshots ?? []) {
        queryCache.invalidateQueries({ key, exact: true })
      }
      for (const slug of input.containerSlug) {
        queryCache.invalidateQueries({
          key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug),
          exact: true
        })
      }
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
      // Deleting children frees slots on their container parents → refresh capacity bars.
      for (const parent of input.parents ?? []) {
        if (parent.kind === 'container') {
          queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(parent.slug), exact: true })
        }
      }
    }
  })
  return { deleteContainer: mutate, ...mutation }
})
