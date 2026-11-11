/*
 * TaskExecutionService - per-step confirmation and skipping of an active activation's held work.
 *
 * Confirming a step performs the stored physical action through the ordinary inventory services,
 * writing through the activation's own holds, then records a durable step outcome. Skipping records
 * that the work was deliberately not carried out and leaves the inventory untouched. Only the
 * colleague who activated the work (the activation's sole executor) may confirm or skip its steps.
 *
 * CouchDB has no multi-document transaction, so each confirmation/skip is wrapped in a
 * TaskOperationDocument for idempotency. Because the underlying inventory mutations are NOT
 * individually idempotent, a confirmation resumes from the inventory action receipt: if the target
 * already carries a receipt stamped with this operationId, the physical action is known to have
 * committed and is not applied again. Matching the current status alone is never treated as proof.
 */
import { couchDB } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { Container, InventoryItem } from '../../../types/inventory'
import type { TypedDocumentReference } from '../../../types/references'
import type {
  DisplayTaskBatchResult,
  DisplayTaskBatchStepResult,
  DisplayTaskStep,
  TaskActivationDocument,
  TaskDocument,
  TaskExecutionSource,
  TaskInventoryStepPayload,
  TaskStepDocument,
  TaskStepOutcome,
  TaskStepResult
} from '../../../types/productivity'
import { assertCanExecuteTask } from '../../auth/taskPolicy'
import {
  type InventoryExecutionContext,
  consumeTargetHold,
  releaseParentClaimsForStep,
  releaseTargetHold
} from '../inventory/reservations.server'
import { ItemService } from '../inventory/items.server'
import { ContainerService } from '../inventory/containers.server'
import { toUserRef } from '../users.server'
import { TaskService } from './tasks.server'
import { TaskStepService } from './steps.server'
import { findActivation, toDisplayActivation } from './activation.server'
import {
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
  isCouchConflict
} from './common'
import { runOperation } from './operations.server'

/** Shared confirm/skip request fields. */
interface StepExecutionInputBase {
  /* Public step identifier within the task. */
  stepId: string
  /* Public activation identity that holds the step. */
  activationId: string
  /* Stable idempotency key for this attempt. */
  operationId: string
  /* How the confirmation reached the system (interactive scanner, paper transcription, online). */
  source: TaskExecutionSource
  /* Executor-reported occurrence time; defaults to server recording time when omitted. */
  reportedAt?: string | null
  notes?: string | null
}

export type ConfirmStepInput = StepExecutionInputBase
export type SkipStepInput = StepExecutionInputBase

/** Confirm several held steps of one activation in dependency order. */
export interface ConfirmBatchInput {
  activationId: string
  operationId: string
  source: TaskExecutionSource
  reportedAt?: string | null
  /* Explicit steps to confirm; omit to confirm every still-held step of the activation. */
  stepIds?: string[]
}

export const TaskExecutionService = {
  /*
   * Confirm that a held step's physical work was carried out: apply the stored inventory action
   * through the executor's own holds, consume and release those holds, and record the outcome.
   */
  async confirmStep(actor: FirnUser, taskSlug: string, input: ConfirmStepInput): Promise<DisplayTaskStep> {
    const { task, activation, step } = await loadExecutionContext(actor, taskSlug, input)

    const taskRef: TypedDocumentReference<TaskDocument> = { db: 'firn', id: task._id, type: 'task' }
    const activationRef: TypedDocumentReference<TaskActivationDocument> = {
      db: 'firn',
      id: activation._id,
      type: 'taskActivation'
    }
    return runOperation<DisplayTaskStep>({
      operationId: input.operationId,
      kind: 'confirm',
      task: taskRef,
      activation: activationRef,
      payload: {
        taskId: task._id,
        activationId: activation.activationId,
        stepId: step.stepId,
        definitionVersion: step.definitionVersion,
        source: input.source
      },
      execute: () => confirm(actor, task, activation, step, input)
    })
  },

  /*
   * Record that a held step was deliberately not carried out. The inventory stays unchanged; the
   * step's holds are released. Skipping never moves, places or changes the lifecycle of any object.
   */
  async skipStep(actor: FirnUser, taskSlug: string, input: SkipStepInput): Promise<DisplayTaskStep> {
    const { task, activation, step } = await loadExecutionContext(actor, taskSlug, input)

    const taskRef: TypedDocumentReference<TaskDocument> = { db: 'firn', id: task._id, type: 'task' }
    const activationRef: TypedDocumentReference<TaskActivationDocument> = {
      db: 'firn',
      id: activation._id,
      type: 'taskActivation'
    }
    return runOperation<DisplayTaskStep>({
      operationId: input.operationId,
      kind: 'skip',
      task: taskRef,
      activation: activationRef,
      payload: {
        taskId: task._id,
        activationId: activation.activationId,
        stepId: step.stepId,
        definitionVersion: step.definitionVersion
      },
      execute: () => skip(actor, activation, step, input)
    })
  },

  /*
   * Confirm a set of held steps (or every remaining held step) of one activation in dependency
   * order, returning a per-step disposition. A step blocked by an unresolved prerequisite or an
   * execution failure is reported and does not abort the rest of the batch. The task is never marked
   * completed here. Each step is confirmed under a derived per-step operation id, so the physical
   * work is independently idempotent and a retried batch never double-applies it.
   */
  async confirmBatch(actor: FirnUser, taskSlug: string, input: ConfirmBatchInput): Promise<DisplayTaskBatchResult> {
    const task = await TaskService.requireReadableTask(actor, taskSlug)
    assertCanExecuteTask(task, actor)
    const activation = await findActivation(task._id, input.activationId)
    if (!activation) throw new TaskNotFoundError()
    if (activation.state !== 'active') {
      throw new TaskValidationError(`Activation is ${activation.state}; only an active activation can be executed.`)
    }
    if (activation.executor.id !== actor._id) {
      throw new TaskValidationError('Only the colleague who activated this work may execute its steps.')
    }

    const taskRef: TypedDocumentReference<TaskDocument> = { db: 'firn', id: task._id, type: 'task' }
    const activationRef: TypedDocumentReference<TaskActivationDocument> = {
      db: 'firn',
      id: activation._id,
      type: 'taskActivation'
    }
    const requested = input.stepIds ? [...input.stepIds].sort() : null
    return runOperation<DisplayTaskBatchResult>({
      operationId: input.operationId,
      kind: 'confirm',
      task: taskRef,
      activation: activationRef,
      payload: { taskId: task._id, activationId: activation.activationId, stepIds: requested, batch: true },
      execute: () => confirmBatch(actor, task, activation.activationId, input)
    })
  }
}

interface ExecutionContext {
  task: TaskDocument
  activation: TaskActivationDocument
  step: TaskStepDocument
}

/* Resolve and authorize the task, its active activation and the held step before any mutation. */
async function loadExecutionContext(
  actor: FirnUser,
  taskSlug: string,
  input: StepExecutionInputBase
): Promise<ExecutionContext> {
  const task = await TaskService.requireReadableTask(actor, taskSlug)
  assertCanExecuteTask(task, actor)

  const activation = await findActivation(task._id, input.activationId)
  if (!activation) throw new TaskNotFoundError()
  if (activation.task.id !== task._id) throw new TaskValidationError('Activation does not belong to this task.')
  // `finished` is accepted so an idempotent retry of the last step of an activation (which flips it
  // to finished) can still reach runOperation's replay; the per-step state guard below prevents any
  // real re-execution.
  if (activation.state !== 'active' && activation.state !== 'finished') {
    throw new TaskValidationError(`Activation is ${activation.state}; only an active activation can be executed.`)
  }
  if (activation.executor.id !== actor._id) {
    throw new TaskValidationError('Only the colleague who activated this work may execute its steps.')
  }

  const steps = await TaskService.getStepsForTask(task._id)
  const step = steps.find(s => s.stepId === input.stepId)
  if (!step) throw new TaskValidationError(`Step ${input.stepId} does not belong to this task.`)
  if (!activation.manifest.some(entry => entry.stepId === step.stepId)) {
    throw new TaskValidationError(`Step ${input.stepId} is not part of this activation.`)
  }

  return { task, activation, step }
}

/* Core confirmation: idempotent physical execution + hold consumption + outcome recording. */
async function confirm(
  actor: FirnUser,
  task: TaskDocument,
  activation: TaskActivationDocument,
  step: TaskStepDocument,
  input: ConfirmStepInput
): Promise<DisplayTaskStep> {
  if (step.state === 'completed' && step.outcome?.operationId === input.operationId) {
    return TaskStepService.toDisplayStep(step)
  }
  if (step.state !== 'held' && step.state !== 'executing') {
    throw new TaskValidationError(`Step ${step.stepId} is ${step.state} and cannot be confirmed.`)
  }
  assertDependenciesResolved(step, activation)

  const now = new Date().toISOString()
  const payload = step.payload

  if (payload.kind === 'text') {
    // A free-text ToDo has no physical target or hold; confirming simply records completion.
    const outcome = buildOutcome('completed', actor, input, now, null, null)
    const updatedStep = await writeStepOutcome(step, 'completed', outcome)
    await finishActivationEntry(activation, step.stepId, 'completed')
    return TaskStepService.toDisplayStep(updatedStep)
  }

  const execution: InventoryExecutionContext = {
    activationId: activation.activationId,
    stepId: step.stepId,
    taskId: task._id,
    operationId: input.operationId,
    reportedAt: input.reportedAt ?? null,
    source: input.source
  }

  const targetId = payload.target.ref.id
  // Receipt-based recovery: if this operation already stamped the target, the physical action
  // committed on an earlier attempt and must not be applied again (the services are not idempotent).
  const alreadyApplied = await targetHasReceipt(targetId, input.operationId)
  if (!alreadyApplied) {
    await applyInventoryAction(payload, actor, execution)
  }

  const holdCtx = {
    activationId: activation.activationId,
    stepId: step.stepId,
    generation: activation.activationVersion,
    operationId: input.operationId
  }
  // Consume then release the target hold (both idempotent). The destination claim was already
  // released just before placement inside applyInventoryAction for move/locate.
  await consumeTargetHold(targetId, holdCtx)
  await releaseTargetHold(targetId, holdCtx)

  const receiptRef: TypedDocumentReference = { db: 'firn', id: targetId, type: payload.target.ref.type }
  const outcome = buildOutcome('completed', actor, input, now, receiptRef, null)
  const updatedStep = await writeStepOutcome(step, 'completed', outcome)
  await finishActivationEntry(activation, step.stepId, 'completed')
  return TaskStepService.toDisplayStep(updatedStep)
}

/* Core skip: record a deliberate non-execution and release the step's own holds. */
async function skip(
  actor: FirnUser,
  activation: TaskActivationDocument,
  step: TaskStepDocument,
  input: SkipStepInput
): Promise<DisplayTaskStep> {
  if (step.state === 'skipped' && step.outcome?.operationId === input.operationId) {
    return TaskStepService.toDisplayStep(step)
  }
  if (step.state !== 'held' && step.state !== 'executing') {
    throw new TaskValidationError(`Step ${step.stepId} is ${step.state} and cannot be skipped.`)
  }

  const now = new Date().toISOString()
  if (step.payload.kind === 'inventory') {
    await releaseStepHolds(step.payload, activation.activationId, step.stepId, activation.activationVersion, input.operationId)
  }

  const outcome = buildOutcome('skipped', actor, input, now, null, null)
  const updatedStep = await writeStepOutcome(step, 'skipped', outcome)
  await finishActivationEntry(activation, step.stepId, 'skipped')
  return TaskStepService.toDisplayStep(updatedStep)
}

/* Core batch confirmation: confirm each targeted held step in dependency order, collecting results. */
async function confirmBatch(
  actor: FirnUser,
  task: TaskDocument,
  activationId: string,
  input: ConfirmBatchInput
): Promise<DisplayTaskBatchResult> {
  const results: DisplayTaskBatchStepResult[] = []
  const requested = input.stepIds ? new Set(input.stepIds) : null

  // Re-read the activation each iteration so dependency checks see prior confirmations.
  let activation = await findActivation(task._id, activationId)
  if (!activation) throw new TaskNotFoundError()

  const steps = await TaskService.getStepsForTask(task._id)
  const stepById = new Map(steps.map(s => [s.stepId, s]))
  const manifestIds = new Set(activation.manifest.map(e => e.stepId))
  const targetIds = orderStepsByDependency(
    activation.manifest
      .map(e => e.stepId)
      .filter(id => !requested || requested.has(id)),
    stepById
  )

  for (const stepId of targetIds) {
    const step = stepById.get(stepId)
    if (!step) {
      results.push({ stepId, status: 'failed', message: 'Step no longer exists.' })
      continue
    }
    if (step.state === 'completed' || step.state === 'skipped' || step.state === 'cancelled') {
      results.push({ stepId, status: 'already_resolved', message: null })
      continue
    }
    const blockedBy = firstUnresolvedDependency(step, activation, manifestIds)
    if (blockedBy) {
      results.push({ stepId, status: 'blocked', message: `Waiting on prerequisite ${blockedBy}.` })
      continue
    }

    const stepInput: ConfirmStepInput = {
      stepId,
      activationId,
      // Derived, deterministic per-step id: idempotent across batch retries via the action receipt.
      operationId: `${input.operationId}:${stepId}`,
      source: input.source,
      reportedAt: input.reportedAt ?? null,
      notes: null
    }
    try {
      await confirm(actor, task, activation, step, stepInput)
      results.push({ stepId, status: 'completed', message: null })
    }
    catch (error) {
      results.push({ stepId, status: 'failed', message: error instanceof Error ? error.message : String(error) })
    }

    // Refresh for the next step's dependency view and for the final projection.
    const refreshed = await findActivation(task._id, activationId)
    if (refreshed) activation = refreshed
    const freshStep = await couchDB.getDocument<TaskStepDocument>(step._id)
    if (freshStep) stepById.set(stepId, freshStep)
  }

  const activationDisplay = await toDisplayActivation(activation, task.slug)
  return { activationId, taskSlug: task.slug, results, activation: activationDisplay }
}

/* The first prerequisite (within this activation) that has not completed, or null when all are met. */
function firstUnresolvedDependency(
  step: TaskStepDocument,
  activation: TaskActivationDocument,
  manifestIds: Set<string>
): string | null {
  for (const depId of step.dependsOn) {
    if (!manifestIds.has(depId)) continue
    const entry = activation.manifest.find(e => e.stepId === depId)
    if (entry && entry.state !== 'completed') return depId
  }
  return null
}

/* Topologically order step ids so each step follows its in-set prerequisites; order breaks ties. */
function orderStepsByDependency(stepIds: string[], stepById: Map<string, TaskStepDocument>): string[] {
  const inSet = new Set(stepIds)
  const ordered: string[] = []
  const placed = new Set<string>()
  const visiting = new Set<string>()

  const visit = (id: string): void => {
    if (placed.has(id) || visiting.has(id)) return
    visiting.add(id)
    const step = stepById.get(id)
    if (step) {
      const deps = [...step.dependsOn].filter(d => inSet.has(d))
      deps.sort((a, b) => (stepById.get(a)?.order ?? 0) - (stepById.get(b)?.order ?? 0))
      for (const dep of deps) visit(dep)
    }
    visiting.delete(id)
    placed.add(id)
    ordered.push(id)
  }

  for (const id of [...stepIds].sort((a, b) => (stepById.get(a)?.order ?? 0) - (stepById.get(b)?.order ?? 0))) {
    visit(id)
  }
  return ordered
}

/*
 * A confirmation requires every prerequisite to have genuinely completed. A skipped prerequisite is
 * not treated as physically performed, so downstream confirmation is blocked for replan or skip.
 */
function assertDependenciesResolved(step: TaskStepDocument, activation: TaskActivationDocument): void {
  for (const depId of step.dependsOn) {
    const entry = activation.manifest.find(e => e.stepId === depId)
    // Prerequisites outside this activation were already completed at activation time (closure rule).
    if (!entry) continue
    if (entry.state !== 'completed') {
      throw new TaskValidationError(
        `Prerequisite ${depId} is ${entry.state}; complete it before confirming ${step.stepId}.`
      )
    }
  }
}

/* Dispatch the stored inventory action to the matching item/container service with execution context. */
async function applyInventoryAction(
  payload: TaskInventoryStepPayload,
  actor: FirnUser,
  execution: InventoryExecutionContext
): Promise<void> {
  const targetSlug = payload.target.slug
  const note = payload.notes ?? null

  if (payload.action === 'move' || payload.action === 'locate') {
    // Release this step's own destination claim just before placement so the ordinary parent
    // capacity/grid guards see no competing hold when the child is written into its reserved slot.
    await releaseParentClaimsForStep(payload.destination.parent.ref.id, {
      activationId: execution.activationId,
      stepId: execution.stepId
    })
    const parentSlug = payload.destination.parent.slug
    const parentKind = destinationParentKind(payload.destination.parent.ref.type)
    const position = payload.destination.position ?? null
    if (payload.targetKind === 'item') {
      const moveInput = { itemSlug: [targetSlug], newParentSlug: parentSlug, newParentKind: parentKind, position, logComment: note }
      if (payload.action === 'move') await ItemService.moveItem(moveInput, actor, execution)
      else await ItemService.locateItem(moveInput, actor, execution)
    }
    else {
      const moveInput = { containerSlug: [targetSlug], newParentSlug: parentSlug, newParentKind: parentKind, position, logComment: note }
      if (payload.action === 'move') await ContainerService.moveContainer(moveInput, actor, execution)
      else await ContainerService.locateContainer(moveInput, actor, execution)
    }
    return
  }

  // checkout / return / dispose are recorded through the alter service.
  if (payload.targetKind === 'item') {
    await ItemService.alterItem(
      { itemSlug: [targetSlug], performedAction: payload.action, logComment: note },
      actor,
      execution
    )
    return
  }
  await ContainerService.alterContainer(
    { containerSlug: [targetSlug], performedAction: payload.action, logComment: note },
    actor,
    execution
  )
}

function destinationParentKind(type: string | undefined): 'equipment' | 'container' {
  if (type === 'storageEquipment') return 'equipment'
  if (type === 'container') return 'container'
  throw new TaskValidationError('A move destination must be a storage equipment or a container.')
}

/* Idempotently release a skipped inventory step's target hold and any destination claim it held. */
export async function releaseStepHolds(
  payload: TaskInventoryStepPayload,
  activationId: string,
  stepId: string,
  generation: number,
  operationId: string
): Promise<void> {
  if (payload.action === 'move' || payload.action === 'locate') {
    await releaseParentClaimsForStep(payload.destination.parent.ref.id, { activationId, stepId })
  }
  await releaseTargetHold(payload.target.ref.id, { activationId, stepId, generation, operationId })
}

/* True when the target document already carries an action-log receipt for this operation. */
async function targetHasReceipt(targetId: string, operationId: string): Promise<boolean> {
  const doc = await couchDB.getDocument<Container | InventoryItem>(targetId)
  if (!doc) return false
  return (doc.actionLog ?? []).some(entry => entry.operationId === operationId)
}

function buildOutcome(
  result: TaskStepResult,
  actor: FirnUser,
  input: StepExecutionInputBase,
  recordedAt: string,
  receiptLogRef: TypedDocumentReference | null,
  failureReason: string | null
): TaskStepOutcome {
  return {
    result,
    performedBy: toUserRef(actor),
    performedAt: input.reportedAt ?? recordedAt,
    recordedAt,
    source: input.source,
    notes: input.notes ?? null,
    operationId: input.operationId,
    receiptLogRef,
    failureReason
  }
}

/* Persist a step's terminal state and outcome, retrying once on a concurrent edit. */
export async function writeStepOutcome(
  step: TaskStepDocument,
  state: TaskStepDocument['state'],
  outcome: TaskStepOutcome
): Promise<TaskStepDocument> {
  let current = step
  for (let attempt = 0; attempt < 2; attempt++) {
    const updated: TaskStepDocument = { ...current, state, outcome, updatedAt: new Date().toISOString() }
    try {
      const result = await couchDB.updateDocument(current._id, updated, current._rev!)
      return { ...updated, _id: result.id, _rev: result.rev }
    }
    catch (error) {
      if (!isCouchConflict(error)) throw error
      const fresh = await couchDB.getDocument<TaskStepDocument>(current._id)
      if (!fresh) throw new TaskConflictError('The step was removed during execution.')
      current = fresh
    }
  }
  throw new TaskConflictError('The step was modified concurrently during execution.')
}

/*
 * Record a step's terminal state in its activation manifest and mark the step's reservation claims
 * released. When every manifest entry is terminal the activation is finished. Best-effort with a
 * short CAS retry; the authoritative step state already persisted above.
 */
export async function finishActivationEntry(
  activation: TaskActivationDocument,
  stepId: string,
  state: 'completed' | 'skipped'
): Promise<void> {
  let current = activation
  for (let attempt = 0; attempt < 3; attempt++) {
    const manifest = current.manifest.map(entry =>
      entry.stepId === stepId ? { ...entry, state } : entry
    )
    const reservationManifest = current.reservationManifest.map(claim =>
      claim.stepId === stepId ? { ...claim, state: 'released' as const } : claim
    )
    const allTerminal = manifest.every(entry => isTerminalState(entry.state))
    const now = new Date().toISOString()
    const updated: TaskActivationDocument = {
      ...current,
      manifest,
      reservationManifest,
      state: allTerminal ? 'finished' : current.state,
      finishedAt: allTerminal ? (current.finishedAt ?? now) : current.finishedAt,
      updatedAt: now
    }
    try {
      const result = await couchDB.updateDocument(current._id, updated, current._rev!)
      current._rev = result.rev
      return
    }
    catch (error) {
      if (!isCouchConflict(error)) throw error
      const fresh = await couchDB.getDocument<TaskActivationDocument>(current._id)
      if (!fresh) return
      current = fresh
    }
  }
}

function isTerminalState(state: string): boolean {
  return state === 'completed' || state === 'skipped' || state === 'cancelled'
}
