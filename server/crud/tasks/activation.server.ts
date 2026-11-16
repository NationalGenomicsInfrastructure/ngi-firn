/*
 * TaskActivationService - explicit activation of a selected subset of a task's planned steps.
 *
 * Activation freezes an executable manifest and acquires the physical holds that protect the
 * selected work (target holds, destination grid-cell / capacity claims). Only after every selected
 * step is protected does the activation become `active` and exportable. Planning never reaches here:
 * drafts, unassigned tasks and generated reminders acquire no holds.
 *
 * Concurrency is kept deliberately simple (see repository guidance: ~40 users, rarely overlapping).
 * The hold primitives are individually idempotent and the whole workflow is wrapped in a
 * TaskOperationDocument, so a retried activation replays its stored result instead of re-acquiring.
 */
import { couchDB, generateCouchDocId, isCouchConflict } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { TypedDocumentReference } from '../../../types/references'
import type { Container, GridPosition, InventoryItem, StorageEquipment } from '../../../types/inventory'
import type {
  DisplayTaskActivation,
  TaskActivationDocument,
  TaskDocument,
  TaskActivationManifestEntry,
  TaskInventoryStepPayload,
  TaskReservationClaim,
  TaskReservationKind,
  TaskStepDocument
} from '../../../types/productivity'
import { assertCanExecuteTask } from '../../auth/taskPolicy'
import {
  type CapacityChildKind,
  ReservationConflictError,
  acquireCapacityClaim,
  acquireGridCellClaim,
  acquireTargetHold,
  findFirstFreeUnheldGridSlot,
  isReservationConflict,
  releaseParentClaimsForStep,
  releaseTargetHold
} from '../inventory/reservations.server'
import { invalidateStepsForDeletedResource } from './invalidation.server'
import { resolveUserRefs, toUserRef } from '../users.server'
import { TaskService } from './tasks.server'
import { TaskStepService } from './steps.server'
import { TaskConflictError, TaskValidationError } from './common'
import { runOperation } from './operations.server'

/** Input to activate a selected subset of a task's steps. */
export interface ActivateStepsInput {
  /* Public stepIds to activate; their unresolved prerequisite closure is included automatically. */
  stepIds: string[]
  /* Stable idempotency key for this activation attempt. */
  operationId: string
}

/* A hold to acquire for the activation, resolved before any resource is written. */
interface PlannedClaim {
  stepId: string
  /* Checklist order of the step, so earlier steps are served first (e.g. get the first free cell). */
  order: number
  resource: TypedDocumentReference<Container | InventoryItem | StorageEquipment>
  claimKind: TaskReservationKind
  /* Grid-cell claims: the requested cell, or null until one is picked while acquiring the claim. */
  position: GridPosition | null
  /* Capacity claims only. */
  category: string | null
  childKind: CapacityChildKind | null
}

const INVENTORY_ITEM_TYPE = 'inventoryItem'

/* Fetch a specific activation of a task by its public activationId, or null when absent. */
export async function findActivation(
  taskId: string,
  activationId: string
): Promise<TaskActivationDocument | null> {
  const rows = (await couchDB.queryView<[string, string], null, TaskActivationDocument>(
    'firn-tasks',
    'activations_by_task',
    { startkey: [taskId, ''], endkey: [taskId, '\ufff0'], include_docs: true }
  )).rows
  const doc = rows
    .map(r => r.doc)
    .find((d): d is TaskActivationDocument => !!d && d.type === 'taskActivation' && d.activationId === activationId)
  return doc ?? null
}

export const TaskActivationService = {
  /*
   * Activate `stepIds` (plus their unresolved prerequisite closure) of an open, assigned task,
   * binding the acting user as sole executor and acquiring the holds that protect the work.
   */
  async activateSteps(
    actor: FirnUser,
    taskSlug: string,
    input: ActivateStepsInput
  ): Promise<DisplayTaskActivation> {
    const task = await TaskService.requireReadableTask(actor, taskSlug)
    assertCanExecuteTask(task, actor)
    if (task.status !== 'open') throw new TaskValidationError('Only an open task can be activated.')
    if (task.archivedAt) throw new TaskValidationError('An archived task cannot be activated.')

    const taskRef: TypedDocumentReference<TaskDocument> = { db: 'firn', id: task._id, type: 'task' }
    return runOperation<DisplayTaskActivation>({
      operationId: input.operationId,
      kind: 'activation',
      task: taskRef,
      activation: null,
      payload: { taskId: task._id, stepIds: [...input.stepIds].sort(), editVersion: task.editVersion },
      execute: () => activate(task, actor, input.stepIds, input.operationId, taskRef)
    })
  }
}

/* Core activation protocol. Runs inside an idempotent operation wrapper. */
async function activate(
  task: TaskDocument,
  actor: FirnUser,
  requestedStepIds: string[],
  operationId: string,
  taskRef: TypedDocumentReference<TaskDocument>
): Promise<DisplayTaskActivation> {
  const steps = await TaskService.getStepsForTask(task._id)
  const byId = new Map(steps.map(s => [s.stepId, s]))

  const toActivate = selectActivationSet(requestedStepIds, byId)

  const targetDocs = await loadInventoryTargets(toActivate)
  const parentDocs = await loadDestinationParents(toActivate)

  // Safety net: a step whose target or destination was deleted is cancelled rather than activated.
  const missing = missingResourceIds(toActivate, targetDocs, parentDocs)
  if (missing.length > 0) {
    for (const resourceId of missing) await invalidateStepsForDeletedResource(resourceId, actor)
    throw new TaskValidationError(
      'Some of the selected steps referred to inventory that no longer exists and were cancelled. Review the task and activate the remaining steps again.'
    )
  }

  const plannedClaims = planClaims(toActivate, targetDocs, parentDocs)

  const activationId = generateCouchDocId('actv')
  const generation = 1

  // Acquire holds in deterministic resource order; roll back this attempt's claims on any conflict.
  const acquired: PlannedClaim[] = []
  try {
    for (const claim of orderClaims(plannedClaims)) {
      await acquireOne(claim, activationId, operationId, generation, toUserRef(actor))
      acquired.push(claim)
    }
  }
  catch (error) {
    await releaseClaims(acquired, activationId, operationId)
    if (isReservationConflict(error)) {
      throw new TaskValidationError(reservationFailureMessage(error))
    }
    throw error
  }

  // Freeze the executable definition, including the grid cell picked for a destination that was
  // planned without one, so execution places into exactly the reserved cell.
  const snapshots = new Map(toActivate.map(step => [step.stepId, withReservedCell(step, plannedClaims)]))
  const manifest: TaskActivationManifestEntry[] = toActivate.map(step => ({
    stepId: step.stepId,
    definitionVersion: step.definitionVersion,
    snapshot: snapshots.get(step.stepId)!
  }))
  const reservationManifest: TaskReservationClaim[] = plannedClaims.map(claim => ({
    stepId: claim.stepId,
    resource: claim.resource,
    claimKind: claim.claimKind,
    position: claim.position,
    generation,
    state: 'held'
  }))

  const now = new Date().toISOString()
  const executor = toUserRef(actor)
  const draft: Omit<TaskActivationDocument, '_rev'> = {
    _id: generateCouchDocId('task-activation'),
    type: 'taskActivation',
    schema: 1,
    activationId,
    task: taskRef,
    executor,
    state: 'active',
    activationVersion: generation,
    manifest,
    reservationManifest,
    exports: [],
    createdAt: now,
    updatedAt: now,
    finishedAt: null
  }

  let activationDoc: TaskActivationDocument | null = null
  const heldSteps: TaskStepDocument[] = []
  try {
    const created = await couchDB.createDocument(draft)
    const readBack = await couchDB.getDocument<TaskActivationDocument>(created.id)
    if (!readBack) throw new Error('Failed to read back the created activation.')
    activationDoc = readBack

    for (const step of toActivate) {
      // The step shows the reserved cell too, so the executor knows where the object goes.
      heldSteps.push(await setStepState(step, 'held', snapshots.get(step.stepId)))
    }
  }
  catch (error) {
    // Preparation failed after holds were acquired: return the steps already marked held to planned
    // (so they can be activated again), release this attempt's protections and mark the half-built
    // activation cancelled so it is never presented as executable.
    for (const step of heldSteps) {
      try {
        const original = toActivate.find(candidate => candidate.stepId === step.stepId)
        await setStepState(step, 'planned', original?.payload)
      }
      catch {
        // Best-effort: a step that cannot be reverted now is surfaced by the failed operation record.
      }
    }
    await releaseClaims(plannedClaims, activationId, operationId)
    if (activationDoc) {
      await cancelActivationDoc(activationDoc)
    }
    throw error
  }

  return toDisplayActivation(activationDoc, task.slug, heldSteps)
}

/*
 * Project an activation document into its client-safe display form. `heldSteps` optionally supplies
 * the already-loaded step documents (as during activation); otherwise the manifest's steps are
 * re-read from the task.
 */
export async function toDisplayActivation(
  activation: TaskActivationDocument,
  taskSlug: string,
  knownSteps?: TaskStepDocument[]
): Promise<DisplayTaskActivation> {
  const [executorRef] = await resolveUserRefs([activation.executor])
  if (!executorRef) throw new Error('Failed to resolve the activation executor.')
  const manifestIds = new Set(activation.manifest.map(entry => entry.stepId))
  const steps = knownSteps
    ?? (await TaskService.getStepsForTask(activation.task.id)).filter(step => manifestIds.has(step.stepId))
  const displaySteps = await Promise.all(steps.map(step => TaskStepService.toDisplayStep(step)))
  return {
    activationId: activation.activationId,
    taskSlug,
    executor: executorRef,
    state: activation.state,
    activationVersion: activation.activationVersion,
    steps: displaySteps,
    createdAt: activation.createdAt,
    updatedAt: activation.updatedAt,
    finishedAt: activation.finishedAt
  }
}

/*
 * Expand the requested steps to the set that must be activated: every requested step plus the
 * transitive closure of its still-unresolved prerequisites. Completed prerequisites need no new
 * hold; a prerequisite in any other non-planned state blocks activation for explicit replanning.
 */
function selectActivationSet(
  requestedStepIds: string[],
  byId: Map<string, TaskStepDocument>
): TaskStepDocument[] {
  if (requestedStepIds.length === 0) {
    throw new TaskValidationError('Select at least one step to activate.')
  }
  const selected = new Map<string, TaskStepDocument>()
  const visiting = new Set<string>()

  const visit = (stepId: string): void => {
    const step = byId.get(stepId)
    if (!step) throw new TaskValidationError(`Step ${stepId} does not belong to this task.`)
    if (selected.has(stepId)) return
    if (visiting.has(stepId)) return
    visiting.add(stepId)
    for (const depId of step.dependsOn) {
      const dep = byId.get(depId)
      if (!dep) throw new TaskValidationError(`Step ${stepId} depends on unknown step ${depId}.`)
      if (dep.state === 'completed') continue
      if (dep.state !== 'planned') {
        throw new TaskValidationError(
          `Prerequisite ${depId} is ${dep.state}; resolve or replan it before activating ${stepId}.`
        )
      }
      visit(depId)
    }
    if (step.state !== 'planned') {
      throw new TaskValidationError(`Step ${stepId} is ${step.state} and cannot be activated.`)
    }
    visiting.delete(stepId)
    selected.set(stepId, step)
  }

  for (const id of requestedStepIds) visit(id)
  return [...selected.values()].sort((a, b) => a.order - b.order)
}

/* Fetch and validate every inventory step's target document, keyed by its document id. */
async function loadInventoryTargets(
  steps: TaskStepDocument[]
): Promise<Map<string, Container | InventoryItem>> {
  const targetIds = steps
    .filter(step => step.payload.kind === 'inventory')
    .map(step => (step.payload as TaskInventoryStepPayload).target.ref.id)
  const unique = [...new Set(targetIds)]
  const docs = await couchDB.getDocumentsByIds<Container | InventoryItem>(unique)
  const byId = new Map<string, Container | InventoryItem>()
  unique.forEach((id, index) => {
    const doc = docs[index]
    if (doc && (doc.type === 'container' || doc.type === INVENTORY_ITEM_TYPE)) {
      byId.set(id, doc)
    }
  })
  return byId
}

/* Fetch every move/locate destination parent in the activation set, keyed by its document id. */
async function loadDestinationParents(
  steps: TaskStepDocument[]
): Promise<Map<string, Container | StorageEquipment>> {
  const parentIds = steps.flatMap((step) => {
    const payload = step.payload
    return payload.kind === 'inventory' && (payload.action === 'move' || payload.action === 'locate')
      ? [payload.destination.parent.ref.id]
      : []
  })
  const unique = [...new Set(parentIds)]
  const docs = await couchDB.getDocumentsByIds<Container | StorageEquipment | { type: string }>(unique)
  const byId = new Map<string, Container | StorageEquipment>()
  unique.forEach((id, index) => {
    const doc = docs[index]
    if (!doc) return
    if (doc.type !== 'container' && doc.type !== 'storageEquipment') {
      throw new TaskValidationError('A move destination must be a storage equipment or a container.')
    }
    byId.set(id, doc as Container | StorageEquipment)
  })
  return byId
}

/* Ids of the targets and destinations the activation set refers to that no longer exist. */
function missingResourceIds(
  steps: TaskStepDocument[],
  targetDocs: Map<string, Container | InventoryItem>,
  parentDocs: Map<string, Container | StorageEquipment>
): string[] {
  const missing = new Set<string>()
  for (const step of steps) {
    const payload = step.payload
    if (payload.kind !== 'inventory') continue
    if (!targetDocs.has(payload.target.ref.id)) missing.add(payload.target.ref.id)
    if ((payload.action === 'move' || payload.action === 'locate') && !parentDocs.has(payload.destination.parent.ref.id)) {
      missing.add(payload.destination.parent.ref.id)
    }
  }
  return [...missing]
}

/* The step's payload with the grid cell reserved for its destination filled in, when one was picked. */
function withReservedCell(step: TaskStepDocument, claims: PlannedClaim[]): TaskStepDocument['payload'] {
  const payload = step.payload
  if (payload.kind !== 'inventory' || (payload.action !== 'move' && payload.action !== 'locate')) return payload
  const cell = claims.find(claim => claim.stepId === step.stepId && claim.claimKind === 'gridCell')?.position
  if (!cell) return payload
  return { ...payload, destination: { ...payload.destination, position: cell } }
}

/* Resolve the concrete holds required by each inventory step in the activation set. */
function planClaims(
  steps: TaskStepDocument[],
  targetDocs: Map<string, Container | InventoryItem>,
  parentDocs: Map<string, Container | StorageEquipment>
): PlannedClaim[] {
  const claims: PlannedClaim[] = []
  for (const step of steps) {
    if (step.payload.kind !== 'inventory') continue
    const payload = step.payload
    const target = targetDocs.get(payload.target.ref.id)
    if (!target) {
      throw new TaskValidationError(`Target of step ${step.stepId} no longer exists in the inventory.`)
    }
    if (payload.expectedStatus && target.status !== payload.expectedStatus) {
      throw new TaskValidationError(
        `Step ${step.stepId} expected its target to be ${payload.expectedStatus}, but it is ${target.status}.`
      )
    }

    claims.push({
      stepId: step.stepId,
      order: step.order,
      resource: payload.target.ref as TypedDocumentReference<Container | InventoryItem>,
      claimKind: 'target',
      position: null,
      category: null,
      childKind: null
    })

    if (payload.action === 'move' || payload.action === 'locate') {
      const parent = parentDocs.get(payload.destination.parent.ref.id)
      if (!parent) {
        throw new TaskValidationError(`Destination of step ${step.stepId} no longer exists in the inventory.`)
      }
      claims.push(planDestinationClaim(step, payload, target, parent))
    }
  }
  return claims
}

/*
 * A move/locate destination reserves either an exact grid cell or one unit of count capacity, decided
 * by how the destination actually stores this kind of object. A destination that cannot take the
 * object at all is refused here, at activation, rather than surfacing when the step is confirmed.
 */
function planDestinationClaim(
  step: TaskStepDocument,
  payload: Extract<TaskInventoryStepPayload, { action: 'move' | 'locate' }>,
  target: Container | InventoryItem,
  parent: Container | StorageEquipment
): PlannedClaim {
  const { stepId, order } = step
  const parentRef = payload.destination.parent.ref as TypedDocumentReference<Container | StorageEquipment>
  const childKind: CapacityChildKind = payload.targetKind === 'item' ? 'item' : 'container'
  const category = target.type === INVENTORY_ITEM_TYPE ? target.category : target.containerType
  const requested = payload.destination.position
  const capacityClaim: PlannedClaim = {
    stepId, order, resource: parentRef, claimKind: 'capacity', position: null, category, childKind
  }

  if (parent.type === 'storageEquipment') {
    if (requested) {
      throw new TaskValidationError(`Step ${stepId} names a grid cell, but "${parent.name}" is storage equipment without a grid.`)
    }
    if (childKind === 'container' && !parent.capacity?.some(entry => entry.type === category)) {
      throw new TaskValidationError(`"${parent.name}" does not accept containers of type "${category}" (step ${stepId}).`)
    }
    return capacityClaim
  }

  const entry = parent.capacity?.find(candidate => candidate.childKind === childKind && candidate.type === category)
  if (!entry) {
    throw new TaskValidationError(`"${parent.name}" does not accept ${childKind}s of type "${category}" (step ${stepId}).`)
  }
  if (entry.layout === 'grid') {
    // With no cell requested, one is picked and reserved while the claim is acquired.
    return { stepId, order, resource: parentRef, claimKind: 'gridCell', position: requested ?? null, category: null, childKind: null }
  }
  if (requested) {
    throw new TaskValidationError(`Step ${stepId} names a grid cell, but "${parent.name}" stores "${category}" by count.`)
  }
  return capacityClaim
}

/* Deterministic acquisition order (resource id, then kind, then checklist order of the step). */
function orderClaims(claims: PlannedClaim[]): PlannedClaim[] {
  return [...claims].sort((a, b) => {
    if (a.resource.id !== b.resource.id) return a.resource.id < b.resource.id ? -1 : 1
    if (a.claimKind !== b.claimKind) return a.claimKind < b.claimKind ? -1 : 1
    return a.order - b.order
  })
}

async function acquireOne(
  claim: PlannedClaim,
  activationId: string,
  operationId: string,
  generation: number,
  executor: TypedDocumentReference<FirnUser>
): Promise<void> {
  if (claim.claimKind === 'target') {
    await acquireTargetHold(claim.resource.id, {
      activationId,
      stepId: claim.stepId,
      generation,
      operationId,
      executor
    })
    return
  }
  if (claim.claimKind === 'gridCell') {
    if (!claim.position) {
      // No cell was planned: reserve the first one that is neither occupied nor already reserved
      // (including by an earlier step of this same activation).
      const parent = await couchDB.getDocument<Container>(claim.resource.id)
      const grid = parent?.type === 'container' ? parent.capacity?.find(entry => entry.layout === 'grid') : undefined
      if (!parent || !grid || grid.layout !== 'grid') {
        throw new ReservationConflictError('The destination has no grid in which a cell could be reserved.')
      }
      const free = await findFirstFreeUnheldGridSlot(parent, grid)
      if (!free) {
        throw new ReservationConflictError(`"${parent.name}" has no free cell left to reserve.`)
      }
      claim.position = free
    }
    await acquireGridCellClaim(claim.resource.id, claim.position, {
      activationId,
      stepId: claim.stepId,
      generation,
      operationId
    })
    return
  }
  if (claim.claimKind === 'capacity') {
    await acquireCapacityClaim(
      claim.resource.id,
      claim.category as string,
      claim.childKind as CapacityChildKind,
      1,
      { activationId, stepId: claim.stepId, generation, operationId }
    )
  }
}

/* Idempotently release every claim recorded for this activation attempt. */
async function releaseClaims(
  claims: PlannedClaim[],
  activationId: string,
  operationId: string
): Promise<void> {
  for (const claim of claims) {
    try {
      if (claim.claimKind === 'target') {
        await releaseTargetHold(claim.resource.id, {
          activationId,
          stepId: claim.stepId,
          generation: 1,
          operationId
        })
      }
      else {
        await releaseParentClaimsForStep(claim.resource.id, { activationId, stepId: claim.stepId })
      }
    }
    catch {
      // Best-effort rollback: a resource that cannot be released now is reported via the failed
      // operation record and recovered explicitly, never silently left in an inconsistent claim.
    }
  }
}

/*
 * Persist a new step lifecycle state (and, when given, the payload that goes with it), retrying once
 * on a concurrent edit.
 */
async function setStepState(
  step: TaskStepDocument,
  state: TaskStepDocument['state'],
  payload?: TaskStepDocument['payload']
): Promise<TaskStepDocument> {
  let current = step
  for (let attempt = 0; attempt < 2; attempt++) {
    const updated: TaskStepDocument = {
      ...current,
      state,
      ...(payload ? { payload } : {}),
      updatedAt: new Date().toISOString()
    }
    try {
      const result = await couchDB.updateDocument(current._id, updated, current._rev!)
      return { ...updated, _id: result.id, _rev: result.rev }
    }
    catch (error) {
      if (!isCouchConflict(error)) throw error
      const fresh = await couchDB.getDocument<TaskStepDocument>(current._id)
      if (!fresh) throw new TaskConflictError('The step was removed during activation.')
      current = fresh
    }
  }
  throw new TaskConflictError('The step was modified concurrently during activation.')
}

async function cancelActivationDoc(activation: TaskActivationDocument): Promise<void> {
  try {
    const updated: TaskActivationDocument = {
      ...activation,
      state: 'cancelled',
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    }
    await couchDB.updateDocument(activation._id, updated, activation._rev!)
  }
  catch {
    // The activation is already protected by a failed operation record; leave recovery explicit.
  }
}

function reservationFailureMessage(error: unknown): string {
  const base = error instanceof Error && error.message ? error.message : 'A target or destination is reserved.'
  return `Cannot activate: ${base}`
}
