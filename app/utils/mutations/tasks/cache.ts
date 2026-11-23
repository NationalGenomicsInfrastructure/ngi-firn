import { useQueryCache } from '@pinia/colada'
import { TRPCClientError } from '@trpc/client'
import type { SerializedEntityRef } from '~~/types/inventory'
import type { DisplayTask, DisplayTaskActivation, DisplayTaskStep } from '~~/types/productivity'
import { INVENTORY_QUERY_KEYS } from '~/utils/queries/inventory'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_EQUIPMENT_QUERY_KEYS } from '~/utils/queries/inventory/equipment'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'
import { TASKS_QUERY_KEYS } from '~/utils/queries/tasks/tasks'

/*
 * Cache helpers shared by the task, step and activation mutations.
 *
 * Task work and inventory are coupled: activating places holds on inventory documents, and
 * confirming, cancelling or reconciling performs (or records) physical work. The inventory reads
 * that subtract held claims (capacity, grid occupancy, move targets, accepted children) and,
 * after physical work, the inventory lists and details must therefore be refreshed by the task
 * mutations. See docs/tasks-and-reservations.md, "Client cache".
 */

/* A caller-supplied idempotency key may be passed in; otherwise the wrapper generates one. */
export type WithOptionalOperationId<T extends { operationId: string }> = Omit<T, 'operationId'> & { operationId?: string }

/*
 * Fill in the operationId before mutate() is called (not inside the mutation function), so the id
 * is part of the mutation variables: a UI retry can resend the same variables and the server then
 * replays the stored result instead of performing the work twice.
 */
export function withOperationId<T extends { operationId: string }>(input: WithOptionalOperationId<T>): T {
  return { ...input, operationId: input.operationId ?? crypto.randomUUID() } as T
}

/* True for a tRPC CONFLICT (TaskConflictError / ReservationConflictError), e.g. a colleague's concurrent edit. */
export function isConflictError(error: unknown): boolean {
  return error instanceof TRPCClientError && (error.data as { code?: string } | undefined)?.code === 'CONFLICT'
}

/* Write a task returned by a mutation to its detail cache and refresh every listing. */
export function applyTask(task: DisplayTask): void {
  const queryCache = useQueryCache()
  queryCache.cancelQueries({ key: TASKS_QUERY_KEYS.detail(task.slug), exact: true })
  queryCache.setQueryData(TASKS_QUERY_KEYS.detail(task.slug), task)
  queryCache.invalidateQueries({ key: TASKS_QUERY_KEYS.lists() })
}

/* Refresh a task, its steps and activations (cascade) and every listing (progress, status). */
export function invalidateTaskWork(taskSlug: string): void {
  const queryCache = useQueryCache()
  queryCache.invalidateQueries({ key: TASKS_QUERY_KEYS.detail(taskSlug) })
  queryCache.invalidateQueries({ key: TASKS_QUERY_KEYS.lists() })
}

/* Patch steps into the cached checklist by stepId; steps not cached yet are appended. */
export function upsertSteps(taskSlug: string, steps: DisplayTaskStep[]): void {
  const queryCache = useQueryCache()
  const key = TASKS_QUERY_KEYS.steps(taskSlug)
  const cached = queryCache.getQueryData<DisplayTaskStep[]>(key)
  if (!cached) return
  const byId = new Map(steps.map(step => [step.stepId, step]))
  const next = cached.map(step => byId.get(step.stepId) ?? step)
  const known = new Set(cached.map(step => step.stepId))
  for (const step of steps) if (!known.has(step.stepId)) next.push(step)
  next.sort((a, b) => a.order - b.order)
  queryCache.cancelQueries({ key, exact: true })
  queryCache.setQueryData(key, next)
}

/* Write an activation to its own cache, the task's activation list and the step checklist. */
export function upsertActivation(activation: DisplayTaskActivation): void {
  const queryCache = useQueryCache()
  const { taskSlug, activationId } = activation
  queryCache.cancelQueries({ key: TASKS_QUERY_KEYS.activation(taskSlug, activationId), exact: true })
  queryCache.setQueryData(TASKS_QUERY_KEYS.activation(taskSlug, activationId), activation)

  const listKey = TASKS_QUERY_KEYS.activations(taskSlug)
  const list = queryCache.getQueryData<DisplayTaskActivation[]>(listKey)
  if (list) {
    const index = list.findIndex(entry => entry.activationId === activationId)
    const next = index === -1 ? [...list, activation] : list.map((entry, i) => i === index ? activation : entry)
    queryCache.cancelQueries({ key: listKey, exact: true })
    queryCache.setQueryData(listKey, next)
  }

  upsertSteps(taskSlug, activation.steps)
}

/*
 * Cached steps of a task, optionally narrowed to some stepIds. Used to derive the inventory touched
 * by a workflow call when it failed and returned no steps of its own.
 */
export function cachedSteps(taskSlug: string, stepIds?: string[]): DisplayTaskStep[] {
  const steps = useQueryCache().getQueryData<DisplayTaskStep[]>(TASKS_QUERY_KEYS.steps(taskSlug)) ?? []
  if (!stepIds) return steps
  const wanted = new Set(stepIds)
  return steps.filter(step => wanted.has(step.stepId))
}

/* Inventory objects referenced by inventory steps: their targets and destination parents. */
export function inventoryRefsOf(steps: DisplayTaskStep[]): SerializedEntityRef[] {
  const refs = new Map<string, SerializedEntityRef>()
  for (const { payload } of steps) {
    if (payload.kind !== 'inventory') continue
    for (const entity of [payload.target.entity, payload.destination?.parent.entity]) {
      if (entity) refs.set(`${entity.kind}:${entity.slug}`, entity)
    }
  }
  return [...refs.values()]
}

/*
 * Refresh the inventory reads that subtract task holds: capacity and grid occupancy of the parents
 * involved, and every move-target / accepted-children / accepted-capacity lookup. Target details
 * need no refresh, because the inventory Display* projections do not expose hold state.
 */
export function invalidateHoldSensitive(refs: SerializedEntityRef[]): void {
  const queryCache = useQueryCache()
  for (const ref of refs) {
    if (ref.kind !== 'container') continue
    queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.capacity(ref.slug), exact: true })
    queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.occupancy(ref.slug), exact: true })
  }
  for (const root of [INVENTORY_CONTAINERS_QUERY_KEYS.root, INVENTORY_ITEMS_QUERY_KEYS.root]) {
    for (const segment of ['move-targets', 'move-targets-batch', 'accepted-children', 'accepted-capacity']) {
      queryCache.invalidateQueries({ key: [...root, segment] })
    }
  }
}

/*
 * Refresh inventory after physical work (confirmed, declared or reconciled steps). The source
 * parent of a move is not part of the step payload, so container and item lists, details and
 * action logs are refreshed by root, as moveItem does.
 */
export function invalidatePhysical(refs: SerializedEntityRef[]): void {
  const queryCache = useQueryCache()
  invalidateHoldSensitive(refs)
  queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
  queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
  for (const ref of refs) {
    if (ref.kind === 'equipment') {
      queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(ref.slug), exact: true })
    }
  }
  queryCache.invalidateQueries({ key: INVENTORY_QUERY_KEYS.counts(), exact: true })
}
