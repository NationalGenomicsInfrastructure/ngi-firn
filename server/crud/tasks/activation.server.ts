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
import { couchDB, generateCouchDocId } from '../../database/couchdb'
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
  acquireCapacityClaim,
  acquireGridCellClaim,
  acquireTargetHold,
  isReservationConflict,
  releaseParentClaimsForStep,
  releaseTargetHold
} from '../inventory/reservations.server'
import { resolveUserRefs, toUserRef } from '../users.server'
import { TaskService } from './tasks.server'
import { TaskStepService } from './steps.server'
import { TaskConflictError, TaskValidationError, isCouchConflict } from './common'
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
  resource: TypedDocumentReference<Container | InventoryItem | StorageEquipment>
  claimKind: TaskReservationKind
  position: GridPosition | null
  /* Capacity claims only. */
  category: string | null
  childKind: CapacityChildKind | null
}

const INVENTORY_ITEM_TYPE = 'inventoryItem'

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
  const plannedClaims = planClaims(toActivate, targetDocs)

  const activationId = generateCouchDocId('actv')
  const generation = 1

  // Acquire holds in deterministic resource order; roll back this attempt's claims on any conflict.
  const acquired: PlannedClaim[] = []
  try {
    for (const claim of orderClaims(plannedClaims)) {
      await acquireOne(claim, activationId, operationId, generation, actor._id)
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

  const manifest: TaskActivationManifestEntry[] = toActivate.map(step => ({
    stepId: step.stepId,
    definitionVersion: step.definitionVersion,
    snapshot: step.payload,
    state: 'held'
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
  const activationDoc: TaskActivationDocument = {
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

  let createdActivation = false
  const heldSteps: TaskStepDocument[] = []
  try {
    const created = await couchDB.createDocument(activationDoc)
    activationDoc._id = created.id
    activationDoc._rev = created.rev
    createdActivation = true

    for (const step of toActivate) {
      heldSteps.push(await setStepState(step, 'held'))
    }
  }
  catch (error) {
    // Preparation failed after holds were acquired: release this attempt's protections and mark the
    // half-built activation cancelled so it is never presented as executable.
    await releaseClaims(plannedClaims, activationId, operationId)
    if (createdActivation) {
      await cancelActivationDoc(activationDoc)
    }
    throw error
  }

  const [executorRef] = await resolveUserRefs([executor])
  const displaySteps = await Promise.all(heldSteps.map(step => TaskStepService.toDisplayStep(step)))
  return {
    activationId,
    taskSlug: task.slug,
    executor: executorRef,
    state: activationDoc.state,
    activationVersion: activationDoc.activationVersion,
    steps: displaySteps,
    createdAt: activationDoc.createdAt,
    updatedAt: activationDoc.updatedAt,
    finishedAt: activationDoc.finishedAt
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

/* Resolve the concrete holds required by each inventory step in the activation set. */
function planClaims(
  steps: TaskStepDocument[],
  targetDocs: Map<string, Container | InventoryItem>
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
      resource: payload.target.ref as TypedDocumentReference<Container | InventoryItem>,
      claimKind: 'target',
      position: null,
      category: null,
      childKind: null
    })

    if (payload.action === 'move' || payload.action === 'locate') {
      claims.push(planDestinationClaim(step.stepId, payload, target))
    }
  }
  return claims
}

/* A move/locate destination reserves either an exact grid cell or one unit of count capacity. */
function planDestinationClaim(
  stepId: string,
  payload: Extract<TaskInventoryStepPayload, { action: 'move' | 'locate' }>,
  target: Container | InventoryItem
): PlannedClaim {
  const parentRef = payload.destination.parent.ref as TypedDocumentReference<
    Container | StorageEquipment
  >
  if (payload.destination.position) {
    return {
      stepId,
      resource: parentRef,
      claimKind: 'gridCell',
      position: payload.destination.position,
      category: null,
      childKind: null
    }
  }
  const childKind: CapacityChildKind = payload.targetKind === 'item' ? 'item' : 'container'
  const category = target.type === INVENTORY_ITEM_TYPE ? target.category : target.containerType
  return {
    stepId,
    resource: parentRef,
    claimKind: 'capacity',
    position: null,
    category,
    childKind
  }
}

/* Deterministic acquisition order (resource id, then kind) to avoid lock-ordering surprises. */
function orderClaims(claims: PlannedClaim[]): PlannedClaim[] {
  return [...claims].sort((a, b) => {
    if (a.resource.id !== b.resource.id) return a.resource.id < b.resource.id ? -1 : 1
    if (a.claimKind !== b.claimKind) return a.claimKind < b.claimKind ? -1 : 1
    return a.stepId < b.stepId ? -1 : 1
  })
}

async function acquireOne(
  claim: PlannedClaim,
  activationId: string,
  operationId: string,
  generation: number,
  executorFirnId: string
): Promise<void> {
  if (claim.claimKind === 'target') {
    await acquireTargetHold(claim.resource.id, {
      activationId,
      stepId: claim.stepId,
      generation,
      operationId,
      executorFirnId
    })
    return
  }
  if (claim.claimKind === 'gridCell') {
    await acquireGridCellClaim(claim.resource.id, claim.position as GridPosition, {
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

/* Persist a new step lifecycle state, retrying once on a concurrent edit. */
async function setStepState(step: TaskStepDocument, state: TaskStepDocument['state']): Promise<TaskStepDocument> {
  let current = step
  for (let attempt = 0; attempt < 2; attempt++) {
    const updated: TaskStepDocument = { ...current, state, updatedAt: new Date().toISOString() }
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
