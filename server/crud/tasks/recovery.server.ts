/*
 * TaskRecoveryService - cancellation, handover and reconciliation of an activation.
 *
 * These are the deliberate, audited ways an activation's holds are released or transferred when the
 * ordinary confirm/skip flow is not enough:
 *  - cancelActivation: abandon an activation. The executor must declare, per still-held step, whether
 *    the physical work was already carried out. If nothing was performed the holds are released and
 *    the steps are cancelled; if anything was performed the activation enters needs_reconciliation and
 *    its holds are retained until explicitly reconciled. Never a blind deletion.
 *  - handover: the current executor passes an activation to another responsible colleague, advancing
 *    the activation version (invalidating earlier paper exports) and re-stamping the live holds.
 *  - reconcile: resolve a needs_reconciliation activation step by step, recording the true outcome
 *    (completed or skipped) and releasing the retained holds.
 *
 * Every workflow is wrapped in a TaskOperationDocument so retries are idempotent. No automatic
 * timeout ever releases a physical hold; abandonment is always an explicit, recorded human action.
 */
import { couchDB } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { TypedDocumentReference } from '../../../types/references'
import type {
  DisplayTaskActivation,
  TaskActivationDocument,
  TaskDocument,
  TaskStepDocument,
  TaskStepResult
} from '../../../types/productivity'
import { isTaskOwner } from '../../auth/taskPolicy'
import { ForbiddenError } from '../../auth/errors'
import {
  acquireTargetHold,
  consumeTargetHold,
  releaseTargetHold
} from '../inventory/reservations.server'
import { isActiveApprovedUser, toUserRef } from '../users.server'
import { TaskService } from './tasks.server'
import { findActivation, toDisplayActivation } from './activation.server'
import {
  finishActivationEntry,
  releaseStepHolds,
  writeStepOutcome
} from './execution.server'
import { TaskConflictError, TaskNotFoundError, TaskValidationError, isCouchConflict } from './common'
import { runOperation } from './operations.server'

/* Per-step declaration of what physically happened, required to cancel an activation. */
export interface CancelStepDeclaration {
  stepId: string
  /* True when the physical work was already carried out outside the confirm flow. */
  physicallyPerformed: boolean
}

export interface CancelActivationInput {
  activationId: string
  operationId: string
  reason: string
  declarations: CancelStepDeclaration[]
}

export interface HandoverInput {
  activationId: string
  operationId: string
  /* Document id (_id) of the colleague who will take over; must be responsible on the task. */
  toExecutorId: string
  /* The current executor's explicit acknowledgement that physical progress is reconciled. */
  acknowledged: boolean
}

/* Per-step reconciliation decision for a needs_reconciliation activation. */
export interface ReconcileStepResolution {
  stepId: string
  /* The true terminal outcome: the work was completed (already done) or was not done (skipped). */
  result: 'completed' | 'skipped'
}

export interface ReconcileInput {
  activationId: string
  operationId: string
  resolutions: ReconcileStepResolution[]
}

export const TaskRecoveryService = {
  /* Abandon an activation with an explicit per-step declaration of what physically happened. */
  async cancelActivation(actor: FirnUser, taskSlug: string, input: CancelActivationInput): Promise<DisplayTaskActivation> {
    const { task, activation } = await loadRecoveryContext(actor, taskSlug, input.activationId, { executorOrOwner: true })
    if (!input.reason?.trim()) throw new TaskValidationError('A cancellation reason is required.')

    const { taskRef, activationRef } = buildRefs(task, activation)
    return runOperation<DisplayTaskActivation>({
      operationId: input.operationId,
      kind: 'cancel',
      task: taskRef,
      activation: activationRef,
      payload: {
        taskId: task._id,
        activationId: activation.activationId,
        declarations: [...input.declarations].sort((a, b) => a.stepId.localeCompare(b.stepId))
      },
      execute: () => cancelActivation(actor, task, activation.activationId, input)
    })
  },

  /* Transfer an active activation to another responsible colleague. Only the current executor may. */
  async handover(actor: FirnUser, taskSlug: string, input: HandoverInput): Promise<DisplayTaskActivation> {
    const { task, activation } = await loadRecoveryContext(actor, taskSlug, input.activationId, { executorOnly: true })
    if (!input.acknowledged) {
      throw new TaskValidationError('Handover requires the current executor to acknowledge that progress is reconciled.')
    }
    if (activation.state !== 'active') {
      throw new TaskValidationError(`Only an active activation can be handed over (state is ${activation.state}).`)
    }

    const { taskRef, activationRef } = buildRefs(task, activation)
    return runOperation<DisplayTaskActivation>({
      operationId: input.operationId,
      kind: 'handover',
      task: taskRef,
      activation: activationRef,
      payload: { taskId: task._id, activationId: activation.activationId, toExecutorId: input.toExecutorId },
      execute: () => handover(task, activation.activationId, input)
    })
  },

  /* Resolve a needs_reconciliation activation step by step, releasing its retained holds. */
  async reconcile(actor: FirnUser, taskSlug: string, input: ReconcileInput): Promise<DisplayTaskActivation> {
    const { task, activation } = await loadRecoveryContext(actor, taskSlug, input.activationId, { executorOrOwner: true })

    const { taskRef, activationRef } = buildRefs(task, activation)
    return runOperation<DisplayTaskActivation>({
      operationId: input.operationId,
      kind: 'reconcile',
      task: taskRef,
      activation: activationRef,
      payload: {
        taskId: task._id,
        activationId: activation.activationId,
        resolutions: [...input.resolutions].sort((a, b) => a.stepId.localeCompare(b.stepId))
      },
      execute: () => reconcile(actor, task, activation.activationId, input)
    })
  }
}

interface RecoveryContext {
  task: TaskDocument
  activation: TaskActivationDocument
}

interface RecoveryAuth {
  executorOnly?: boolean
  executorOrOwner?: boolean
}

async function loadRecoveryContext(
  actor: FirnUser,
  taskSlug: string,
  activationId: string,
  auth: RecoveryAuth
): Promise<RecoveryContext> {
  const task = await TaskService.requireReadableTask(actor, taskSlug)
  const activation = await findActivation(task._id, activationId)
  if (!activation) throw new TaskNotFoundError()
  if (activation.task.id !== task._id) throw new TaskValidationError('Activation does not belong to this task.')

  const isExecutor = activation.executor.id === actor._id
  if (auth.executorOnly && !isExecutor) {
    throw new ForbiddenError('Only the current executor can perform this action.')
  }
  if (auth.executorOrOwner && !isExecutor && !isTaskOwner(task, actor)) {
    throw new ForbiddenError('Only the executor or the task owner can perform this action.')
  }
  return { task, activation }
}

function buildRefs(task: TaskDocument, activation: TaskActivationDocument): {
  taskRef: TypedDocumentReference<TaskDocument>
  activationRef: TypedDocumentReference<TaskActivationDocument>
} {
  return {
    taskRef: { db: 'firn', id: task._id, type: 'task' },
    activationRef: { db: 'firn', id: activation._id, type: 'taskActivation' }
  }
}

/* The step states that still hold protections and can therefore be cancelled/reconciled. */
function isLiveStepState(state: TaskStepDocument['state']): boolean {
  return state === 'held' || state === 'executing' || state === 'needs_reconciliation'
}

async function cancelActivation(
  actor: FirnUser,
  task: TaskDocument,
  activationId: string,
  input: CancelActivationInput
): Promise<DisplayTaskActivation> {
  const activation = await findActivation(task._id, activationId)
  if (!activation) throw new TaskNotFoundError()

  const steps = await TaskService.getStepsForTask(task._id)
  const stepById = new Map(steps.map(s => [s.stepId, s]))
  const declByStep = new Map(input.declarations.map(d => [d.stepId, d.physicallyPerformed]))

  const liveSteps = activation.manifest
    .map(entry => stepById.get(entry.stepId))
    .filter((s): s is TaskStepDocument => !!s && isLiveStepState(s.state))

  // Every still-held step must be declared, so cancellation can never silently drop a hold.
  for (const step of liveSteps) {
    if (!declByStep.has(step.stepId)) {
      throw new TaskValidationError(`Declare whether step ${step.stepId} was physically performed before cancelling.`)
    }
  }

  let anyPerformed = false
  for (const step of liveSteps) {
    const performed = declByStep.get(step.stepId) === true
    if (performed) {
      anyPerformed = true
      // The physical world changed outside the confirm flow: keep the hold, flag for reconciliation.
      await writeStepOutcome(step, 'needs_reconciliation', {
        result: 'failed',
        performedBy: toUserRef(actor),
        performedAt: null,
        recordedAt: new Date().toISOString(),
        source: 'online',
        notes: input.reason,
        operationId: input.operationId,
        receiptLogRef: null,
        failureReason: 'Declared physically performed during cancellation; requires reconciliation.'
      })
    }
    else {
      // Nothing was done: release the step's holds and cancel it cleanly.
      if (step.payload.kind === 'inventory') {
        await releaseStepHolds(step.payload, activationId, step.stepId, activation.activationVersion, input.operationId)
      }
      await writeStepOutcome(step, 'cancelled', {
        result: 'cancelled',
        performedBy: toUserRef(actor),
        performedAt: null,
        recordedAt: new Date().toISOString(),
        source: 'online',
        notes: input.reason,
        operationId: input.operationId,
        receiptLogRef: null,
        failureReason: null
      })
    }
  }

  const nextState = anyPerformed ? 'needs_reconciliation' : 'cancelled'
  await setActivationState(activation, nextState, !anyPerformed)
  const refreshed = await findActivation(task._id, activationId)
  return toDisplayActivation(refreshed ?? activation, task.slug)
}

async function handover(
  task: TaskDocument,
  activationId: string,
  input: HandoverInput
): Promise<DisplayTaskActivation> {
  const activation = await findActivation(task._id, activationId)
  if (!activation) throw new TaskNotFoundError()

  const newExecutor = await couchDB.getDocument<FirnUser>(input.toExecutorId)
  if (!newExecutor || newExecutor.type !== 'firnUser' || !isActiveApprovedUser(newExecutor)) {
    throw new TaskValidationError('The new executor must be an active, approved user.')
  }
  const isResponsible = task.responsibleUsers.some(r => r.id === newExecutor._id) || isTaskOwner(task, newExecutor)
  if (!isResponsible) {
    throw new TaskValidationError('The new executor must be a responsible colleague on this task.')
  }

  const nextGeneration = activation.activationVersion + 1
  const newExecutorRef = toUserRef(newExecutor)

  // Re-stamp every live target hold with the new executor and generation so the handover is audited
  // on the resource itself; grid/capacity claims carry no executor and need no change.
  for (const claim of activation.reservationManifest) {
    if (claim.claimKind !== 'target' || claim.state === 'released') continue
    try {
      await acquireTargetHold(claim.resource.id, {
        activationId,
        stepId: claim.stepId,
        generation: nextGeneration,
        operationId: input.operationId,
        executorFirnId: newExecutor._id
      })
    }
    catch {
      // Best-effort re-stamp: enforcement uses the activation's executor, recovered explicitly if lost.
    }
  }

  await mutateActivation(activation, (doc) => {
    doc.executor = newExecutorRef
    doc.activationVersion = nextGeneration
    doc.reservationManifest = doc.reservationManifest.map(claim =>
      claim.claimKind === 'target' && claim.state !== 'released'
        ? { ...claim, generation: nextGeneration }
        : claim
    )
    // Earlier paper exports are now invalid: a handover advances the version they were printed for.
    doc.exports = []
    return true
  })

  const refreshed = await findActivation(task._id, activationId)
  return toDisplayActivation(refreshed ?? activation, task.slug)
}

async function reconcile(
  actor: FirnUser,
  task: TaskDocument,
  activationId: string,
  input: ReconcileInput
): Promise<DisplayTaskActivation> {
  const activation = await findActivation(task._id, activationId)
  if (!activation) throw new TaskNotFoundError()
  if (activation.state !== 'needs_reconciliation') {
    throw new TaskValidationError(`Only an activation needing reconciliation can be reconciled (state is ${activation.state}).`)
  }

  const steps = await TaskService.getStepsForTask(task._id)
  const stepById = new Map(steps.map(s => [s.stepId, s]))

  for (const resolution of input.resolutions) {
    const step = stepById.get(resolution.stepId)
    if (!step) throw new TaskValidationError(`Step ${resolution.stepId} does not belong to this task.`)
    if (step.state !== 'needs_reconciliation') continue

    const result: TaskStepResult = resolution.result === 'completed' ? 'completed' : 'skipped'
    if (step.payload.kind === 'inventory') {
      // Release the retained holds now that the true disposition is recorded. For a completed step
      // the physical change already exists; reconciliation does not re-apply it.
      const holdCtx = {
        activationId,
        stepId: step.stepId,
        generation: activation.activationVersion,
        operationId: input.operationId
      }
      if (resolution.result === 'completed') {
        await consumeTargetHold(step.payload.target.ref.id, holdCtx)
        await releaseTargetHold(step.payload.target.ref.id, holdCtx)
      }
      await releaseStepHolds(step.payload, activationId, step.stepId, activation.activationVersion, input.operationId)
    }

    await writeStepOutcome(step, resolution.result, {
      result,
      performedBy: toUserRef(actor),
      performedAt: null,
      recordedAt: new Date().toISOString(),
      source: 'online',
      notes: null,
      operationId: input.operationId,
      receiptLogRef: null,
      failureReason: null
    })
    await finishActivationEntry(activation, step.stepId, resolution.result)
  }

  const refreshed = await findActivation(task._id, activationId)
  return toDisplayActivation(refreshed ?? activation, task.slug)
}

/* Set an activation's terminal/recovery state, retrying once on a concurrent edit. */
async function setActivationState(
  activation: TaskActivationDocument,
  state: TaskActivationDocument['state'],
  finished: boolean
): Promise<void> {
  await mutateActivation(activation, (doc) => {
    doc.state = state
    if (finished && !doc.finishedAt) doc.finishedAt = new Date().toISOString()
    return true
  })
}

/* Apply a mutation to an activation document under CAS with a short retry. */
async function mutateActivation(
  activation: TaskActivationDocument,
  apply: (doc: TaskActivationDocument) => boolean
): Promise<void> {
  let current = activation
  for (let attempt = 0; attempt < 3; attempt++) {
    const draft: TaskActivationDocument = { ...current, updatedAt: new Date().toISOString() }
    if (!apply(draft)) return
    try {
      const result = await couchDB.updateDocument(current._id, draft, current._rev!)
      current._rev = result.rev
      return
    }
    catch (error) {
      if (!isCouchConflict(error)) throw error
      const fresh = await couchDB.getDocument<TaskActivationDocument>(current._id)
      if (!fresh) throw new TaskConflictError('The activation was removed during recovery.')
      current = fresh
    }
  }
  throw new TaskConflictError('The activation was modified concurrently during recovery.')
}
