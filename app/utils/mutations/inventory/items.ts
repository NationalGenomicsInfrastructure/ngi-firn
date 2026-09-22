import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { DisplayInventoryItem, InventoryActiveFlag } from '~~/types/inventory'
import type { InventoryActionType, InventoryFlagType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import { isVacatingAction } from '~~/schemas/inventory/metadata'
import type {
  AlterItemSchemaInput,
  CreateItemSchemaInput,
  DeleteItemSchemaInput,
  LocateItemSchemaInput,
  MoveItemSchemaInput,
  UpdateItemSchemaInput
} from '~~/schemas/inventory/items'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'

const { showSuccess, showError } = useFirnToast()

const STATUS_FROM_ACTION: Partial<Record<InventoryActionType, InventoryStatusType>> = {
  checkout: 'in_use',
  return: 'available',
  mark_expired: 'expired',
  dispose: 'disposed',
  post_missing: 'lost',
  reserve: 'reserved',
  unreserve: 'available'
}

type ItemDetailContext = { item: DisplayInventoryItem | undefined }
type ItemListContext = { list: DisplayInventoryItem[], key: readonly string[] }
type ItemSnapshotsContext = {
  details: { slug: string, item: DisplayInventoryItem | undefined }[]
  lists: { key: readonly string[], list: DisplayInventoryItem[] }[]
  parentContainerSlugs: string[]
}

function parentListKey(parentRef: DisplayInventoryItem['parentRef']): readonly string[] | null {
  if (!parentRef) return null
  return parentRef.kind === 'equipment'
    ? INVENTORY_ITEMS_QUERY_KEYS.byEquipment(parentRef.slug)
    : INVENTORY_ITEMS_QUERY_KEYS.byParent(parentRef.slug)
}

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

function optimisticFlags(item: DisplayInventoryItem, input: AlterItemSchemaInput): InventoryActiveFlag[] | null {
  const flags = input.performedAction === 'flag' && input.flagKind
    ? upsertActiveFlag(item.activeFlags, input.flagKind as InventoryFlagType, input.logComment ?? null)
    : input.performedAction === 'unflag' && input.flagKind
      ? (item.activeFlags ?? []).filter(flag => flag.kind !== input.flagKind)
      : item.activeFlags
  return flags && flags.length > 0 ? flags : null
}

export const createItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.createItem.mutate(input)
    },
    onMutate(input): ItemListContext {
      const queryCache = useQueryCache()
      const key = input.parentKind === 'equipment'
        ? INVENTORY_ITEMS_QUERY_KEYS.byEquipment(input.parentSlug)
        : INVENTORY_ITEMS_QUERY_KEYS.byParent(input.parentSlug)
      return { key, list: queryCache.getQueryData<DisplayInventoryItem[]>(key) ?? [] }
    },
    onError(error: Error, _input, context) {
      if (context?.key) useQueryCache().setQueryData(context.key, context.list ?? [])
      showError(error.message, 'Item could not be created')
    },
    onSuccess(item) {
      showSuccess(`Item "${item.name}" created successfully.`, 'Item created')
      navigateTo(`/inventory/items/${encodeURIComponent(item.slug)}/details`)
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      const key = input.parentKind === 'equipment'
        ? INVENTORY_ITEMS_QUERY_KEYS.byEquipment(input.parentSlug)
        : INVENTORY_ITEMS_QUERY_KEYS.byParent(input.parentSlug)
      queryCache.invalidateQueries({ key, exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
      if (input.parentKind === 'container') {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(input.parentSlug), exact: true })
      }
    }
  })
  return { createItem: mutate, ...mutation }
})

export const updateItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.updateItem.mutate(input)
    },
    onMutate(input): ItemDetailContext {
      const queryCache = useQueryCache()
      const item = queryCache.getQueryData<DisplayInventoryItem>(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug))
      if (item) {
        queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), {
          ...item,
          ...(input.classification !== undefined && { classification: input.classification ?? null }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.label !== undefined && { label: input.label ?? null }),
          ...(input.description !== undefined && { description: input.description ?? null }),
          ...(input.quantity !== undefined && { quantity: input.quantity ?? null }),
          ...(input.unit !== undefined && { unit: input.unit ?? null }),
          ...(input.concentration !== undefined && { concentration: input.concentration ?? null }),
          ...(input.concentrationUnit !== undefined && { concentrationUnit: input.concentrationUnit ?? null }),
          ...(input.arrivalDate !== undefined && { arrivalDate: input.arrivalDate ?? null }),
          ...(input.openingDate !== undefined && { openingDate: input.openingDate ?? null }),
          ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate ?? null }),
          ...(input.lotNumber !== undefined && { lotNumber: input.lotNumber ?? null }),
          ...(input.barcode !== undefined && { barcode: input.barcode ?? null }),
          ...(input.templateId !== undefined && { templateId: input.templateId ?? null }),
          ...(input.notes !== undefined && { notes: input.notes ?? null }),
          ...(input.metadata !== undefined && { metadata: input.metadata ?? null })
        })
      }
      return { item }
    },
    onError(error: Error, input, context) {
      if (context.item) useQueryCache().setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), context.item)
      showError(error.message, 'Item could not be updated')
    },
    onSuccess(item) {
      showSuccess(`Item "${item.name}" updated successfully.`, 'Item updated')
      navigateTo(`/inventory/items/${encodeURIComponent(item.slug)}/details`)
    },
    onSettled(data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), exact: true })
      if (data && data.slug !== input.itemSlug) {
        queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(data.slug), exact: true })
      }
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
    }
  })
  return { updateItem: mutate, ...mutation }
})

function captureItems(
  queryCache: ReturnType<typeof useQueryCache>,
  slugs: string[],
  supplied: DisplayInventoryItem[] | undefined,
  transform: (item: DisplayInventoryItem) => DisplayInventoryItem | null
): ItemSnapshotsContext {
  const selected = new Map((supplied ?? []).map(item => [item.slug, item]))
  const details = slugs.map((slug) => {
    const item = queryCache.getQueryData<DisplayInventoryItem>(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(slug)) ?? selected.get(slug)
    if (item) queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(slug), transform(item))
    return { slug, item }
  })
  const keys = new Map<string, readonly string[]>()
  for (const { item } of details) {
    const key = item ? parentListKey(item.parentRef) : null
    if (key) keys.set(key.join('\u0000'), key)
  }
  const lists = [...keys.values()].map(key => ({ key, list: queryCache.getQueryData<DisplayInventoryItem[]>(key) ?? [] }))
  const parentContainerSlugs = details.flatMap(({ item }) => item?.parentRef?.kind === 'container' ? [item.parentRef.slug] : [])
  return { details, lists, parentContainerSlugs }
}

function restoreItems(queryCache: ReturnType<typeof useQueryCache>, context: Partial<ItemSnapshotsContext> | undefined): void {
  for (const { slug, item } of context?.details ?? []) {
    if (item) queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(slug), item)
  }
  for (const { key, list } of context?.lists ?? []) queryCache.setQueryData(key, list)
}

export const moveItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: MoveItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.moveItem.mutate(input)
    },
    onMutate(input): ItemSnapshotsContext {
      return captureItems(useQueryCache(), input.itemSlug, undefined, item => item)
    },
    onError(error: Error, _input, context) {
      restoreItems(useQueryCache(), context)
      showError(error.message, 'Item could not be moved')
    },
    onSuccess(items) {
      showSuccess(items.length === 1 ? `Item "${items[0]?.name}" moved successfully.` : `${items.length} items moved successfully.`, 'Item moved')
    },
    onSettled(_data, _error, input, context) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
      for (const parentSlug of context?.parentContainerSlugs ?? []) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(parentSlug), exact: true })
      }
      if (input.newParentKind === 'container') {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(input.newParentSlug), exact: true })
      }
    }
  })
  return { moveItem: mutate, ...mutation }
})

export const locateItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: LocateItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.locateItem.mutate(input)
    },
    onMutate(input): ItemSnapshotsContext {
      return captureItems(useQueryCache(), input.itemSlug, undefined, item => ({ ...item, status: 'available' }))
    },
    onError(error: Error, _input, context) {
      restoreItems(useQueryCache(), context)
      showError(error.message, 'Item could not be located')
    },
    onSuccess(items) {
      showSuccess(items.length === 1 ? `Item "${items[0]?.name}" located and returned to storage.` : `${items.length} items located and returned to storage.`, 'Item located')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
      if (input.newParentKind === 'container') {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(input.newParentSlug), exact: true })
      }
    }
  })
  return { locateItem: mutate, ...mutation }
})

export const alterItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: AlterItemSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.alterItem.mutate(input)
    },
    onMutate(input): ItemSnapshotsContext {
      const vacating = isVacatingAction(input.performedAction)
      const status = STATUS_FROM_ACTION[input.performedAction]
      const context = captureItems(useQueryCache(), input.itemSlug, undefined, item => ({
        ...item,
        ...(status !== undefined && { status }),
        ...(vacating && { parentRef: null, position: null }),
        activeFlags: optimisticFlags(item, input)
      }))
      const slugSet = new Set(input.itemSlug)
      const queryCache = useQueryCache()
      for (const { key, list } of context.lists) {
        queryCache.cancelQueries({ key, exact: true })
        queryCache.setQueryData(key, vacating
          ? list.filter(item => !slugSet.has(item.slug))
          : list.map(item => slugSet.has(item.slug)
              ? {
                  ...item,
                  ...(status !== undefined && { status }),
                  activeFlags: optimisticFlags(item, input)
                }
              : item))
      }
      return context
    },
    onError(error: Error, _input, context) {
      restoreItems(useQueryCache(), context)
      showError(error.message, 'Item action could not be performed')
    },
    onSuccess(_items, input) {
      showSuccess(input.itemSlug.length === 1
        ? `Action "${input.performedAction}" applied successfully.`
        : `Action "${input.performedAction}" applied to ${input.itemSlug.length} items.`, 'Action applied')
    },
    onSettled(_data, _error, input, context) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      if (isVacatingAction(input.performedAction)) {
        queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
        for (const parentSlug of context?.parentContainerSlugs ?? []) {
          queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(parentSlug), exact: true })
        }
      }
    }
  })
  return { alterItem: mutate, ...mutation }
})

export const addItemProjectRef = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: { itemSlug: string, projectId: string }) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.addProjectRef.mutate(input)
    },
    onMutate(input): ItemDetailContext {
      const queryCache = useQueryCache()
      const item = queryCache.getQueryData<DisplayInventoryItem>(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug))
      if (item) {
        queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), {
          ...item,
          projectRefs: [...(item.projectRefs ?? []), { slug: input.projectId, name: input.projectId, kind: 'project' }]
        })
      }
      return { item }
    },
    onError(error: Error, input, context) {
      if (context.item) useQueryCache().setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), context.item)
      showError(error.message, 'Project reference could not be added')
    },
    onSuccess(_item, input) {
      showSuccess(`Project "${input.projectId}" linked successfully.`, 'Project linked')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.projectRefs(input.itemSlug), exact: true })
    }
  })
  return { addItemProjectRef: mutate, ...mutation }
})

export const removeItemProjectRef = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: { itemSlug: string, projectId: string }) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.removeProjectRef.mutate(input)
    },
    onMutate(input): ItemDetailContext {
      const queryCache = useQueryCache()
      const item = queryCache.getQueryData<DisplayInventoryItem>(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug))
      if (item) {
        const projectRefs = (item.projectRefs ?? []).filter(ref => ref.slug !== input.projectId)
        queryCache.setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), {
          ...item,
          projectRefs: projectRefs.length > 0 ? projectRefs : null
        })
      }
      return { item }
    },
    onError(error: Error, input, context) {
      if (context.item) useQueryCache().setQueryData(INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), context.item)
      showError(error.message, 'Project reference could not be removed')
    },
    onSuccess(_item, input) {
      showSuccess(`Project "${input.projectId}" unlinked successfully.`, 'Project unlinked')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.itemSlug), exact: true })
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.projectRefs(input.itemSlug), exact: true })
    }
  })
  return { removeItemProjectRef: mutate, ...mutation }
})

type DeleteItemMutationInput = DeleteItemSchemaInput & {
  itemNames?: string[]
  parents?: { slug: string, kind: 'equipment' | 'container' }[]
}

export const deleteItem = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteItemMutationInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.deleteItem.mutate({ itemSlug: input.itemSlug })
    },
    onMutate(input): ItemSnapshotsContext {
      const queryCache = useQueryCache()
      const context = captureItems(queryCache, input.itemSlug, undefined, () => null)
      const keys = new Map(context.lists.map(entry => [entry.key.join('\u0000'), entry]))
      for (const parent of input.parents ?? []) {
        const key = parent.kind === 'equipment'
          ? INVENTORY_ITEMS_QUERY_KEYS.byEquipment(parent.slug)
          : INVENTORY_ITEMS_QUERY_KEYS.byParent(parent.slug)
        if (!keys.has(key.join('\u0000'))) {
          keys.set(key.join('\u0000'), { key, list: queryCache.getQueryData<DisplayInventoryItem[]>(key) ?? [] })
        }
      }
      const slugs = new Set(input.itemSlug)
      context.lists = [...keys.values()]
      for (const { key, list } of context.lists) {
        queryCache.cancelQueries({ key, exact: true })
        queryCache.setQueryData(key, list.filter(item => !slugs.has(item.slug)))
      }
      return context
    },
    onError(error: Error, _input, context) {
      restoreItems(useQueryCache(), context)
      showError(error.message, 'Item could not be deleted')
    },
    onSuccess(data, input, context) {
      const queryCache = useQueryCache()
      const deletedSlugs = new Set(data.deleted.map(item => item.slug))
      for (const { key, list } of context.lists) {
        queryCache.setQueryData(key, list.filter(item => !deletedSlugs.has(item.slug)))
      }
      if (data.deleted.length > 0) {
        showSuccess(data.deleted.length === 1 ? `Item "${input.itemNames?.[0] ?? data.deleted[0]?.name}" deleted successfully.` : `${data.deleted.length} items deleted successfully.`, 'Item deleted')
      }
      if (data.failures.length > 0) {
        showError(data.failures.map(failure => `${failure.slug}: ${failure.error}`).join('\n'), 'Some items could not be deleted')
      }
      if (input.itemSlug.length === 1 && data.deleted.length === 1) {
        navigateTo('/inventory/items')
      }
    },
    onSettled(_data, _error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
      queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
      for (const parentSlug of context?.parentContainerSlugs ?? []) {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(parentSlug), exact: true })
      }
    }
  })
  return { deleteItem: mutate, ...mutation }
})
