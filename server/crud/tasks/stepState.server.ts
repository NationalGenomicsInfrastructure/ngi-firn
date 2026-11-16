/*
 * Step and activation state primitives.
 *
 * The step document is the single source of truth for a step's state. An activation's own state is
 * always DERIVED from its step documents (refreshActivationState) and never written from a stale
 * in-memory copy; the activation manifest is an immutable snapshot of what was activated.
 *
 * This module deliberately depends only on the database, the reservation primitives and the shared
 * task helpers, never on the inventory or task services. That keeps it importable from both sides:
 * the task services use it to record outcomes, and the inventory services reach it (through
 * invalidation.server.ts) when a delete has to cancel task steps, without creating an import cycle.
 */
import { couchDB, isCouchConflict } from '../../database/couchdb'
import type {
  TaskActivationDocument,
  TaskInventoryStepPayload,
  TaskStepDocument,
  TaskStepOutcome,
  TaskStepPayload,
  TaskStepState
} from '../../../types/productivity'
import {
  ReservationResourceMissingError,
  releaseParentClaimsForStep,
  releaseTargetHold
} from '../inventory/reservations.server'
import { TaskConflictError } from './common'

/* Every step document of a task, in checklist order. */
export async function loadStepsForTask(taskId: string): Promise<TaskStepDocument[]> {
  const rows = (await couchDB.queryView<[string, number], null, TaskStepDocument>('firn-tasks', 'steps_by_task', {
    startkey: [taskId, 0],
    endkey: [taskId, Number.MAX_SAFE_INTEGER],
    include_docs: true
  })).rows
  return rows
    .map(r => r.doc)
    .filter((d): d is TaskStepDocument => !!d && d.type === 'taskStep')
    .sort((a, b) => a.order - b.order)
}

/* Every activation document of a task. */
export async function loadActivationsForTask(taskId: string): Promise<TaskActivationDocument[]> {
  const rows = (await couchDB.queryView<[string, string], null, TaskActivationDocument>(
    'firn-tasks',
    'activations_by_task',
    { startkey: [taskId, ''], endkey: [taskId, '￰'], include_docs: true }
  )).rows
  return rows
    .map(r => r.doc)
    .filter((d): d is TaskActivationDocument => !!d && d.type === 'taskActivation')
}

export function isTerminalStepState(state: TaskStepState): boolean {
  return state === 'completed' || state === 'skipped' || state === 'cancelled'
}

/* A step that has not reached a terminal state: it may still be activated, executed or reconciled. */
export function isOpenStepState(state: TaskStepState): boolean {
  return !isTerminalStepState(state)
}

/* The payload frozen into the activation for this step (falls back to the step for safety). */
export function executablePayload(activation: TaskActivationDocument, step: TaskStepDocument): TaskStepPayload {
  return activation.manifest.find(entry => entry.stepId === step.stepId)?.snapshot ?? step.payload
}

/* Persist a step's state and outcome, retrying once on a concurrent edit. */
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

/* Run a hold release, treating a resource that no longer exists as already released. */
async function releaseIgnoringMissing(release: () => Promise<unknown>): Promise<void> {
  try {
    await release()
  }
  catch (error) {
    if (!(error instanceof ReservationResourceMissingError)) throw error
  }
}

/*
 * Idempotently release an inventory step's destination claim and its share of the target hold. A
 * target or destination that has since been deleted carries no hold any more and is skipped.
 */
export async function releaseStepHolds(
  payload: TaskInventoryStepPayload,
  activationId: string,
  stepId: string,
  generation: number,
  operationId: string | null
): Promise<void> {
  if (payload.action === 'move' || payload.action === 'locate') {
    await releaseIgnoringMissing(() =>
      releaseParentClaimsForStep(payload.destination.parent.ref.id, { activationId, stepId })
    )
  }
  await releaseIgnoringMissing(() =>
    releaseTargetHold(payload.target.ref.id, { activationId, stepId, generation, operationId })
  )
}

/*
 * Recompute an activation's state from its step documents. Always starts from a fresh read of the
 * activation and its steps, so callers can never write back a stale copy. Marks the reservation
 * claims of terminal steps released and:
 *  - keeps `cancelled` once set;
 *  - is `needs_reconciliation` while any step is in that state;
 *  - becomes `finished` when every manifest step is terminal (`cancelled` when all were cancelled,
 *    or when `abandon` marks an explicit cancellation of the whole activation);
 *  - otherwise stays (or returns to) `active`.
 */
export async function refreshActivationState(
  activationDocId: string,
  options: { abandon?: boolean } = {}
): Promise<TaskActivationDocument | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await couchDB.getDocument<TaskActivationDocument>(activationDocId)
    if (!current) return null
    const steps = await loadStepsForTask(current.task.id)
    const stateById = new Map(steps.map(s => [s.stepId, s.state]))
    // A step document that no longer exists holds nothing and counts as cancelled.
    const states: TaskStepState[] = current.manifest.map(entry => stateById.get(entry.stepId) ?? 'cancelled')
    const terminalIds = new Set(
      current.manifest.filter((_, index) => isTerminalStepState(states[index]!)).map(entry => entry.stepId)
    )

    const reservationManifest = current.reservationManifest.map(claim =>
      terminalIds.has(claim.stepId) && claim.state !== 'released' ? { ...claim, state: 'released' as const } : claim
    )
    const claimsChanged = reservationManifest.some((claim, index) => claim !== current.reservationManifest[index])

    const allTerminal = states.every(isTerminalStepState)
    let state = current.state
    if (current.state !== 'cancelled') {
      if (states.includes('needs_reconciliation')) state = 'needs_reconciliation'
      else if (allTerminal) state = options.abandon || states.every(s => s === 'cancelled') ? 'cancelled' : 'finished'
      else if (current.state === 'needs_reconciliation') state = 'active'
    }
    if (state === current.state && !claimsChanged) return current

    const now = new Date().toISOString()
    const closed = state === 'finished' || state === 'cancelled'
    const updated: TaskActivationDocument = {
      ...current,
      reservationManifest,
      state,
      finishedAt: closed ? (current.finishedAt ?? now) : null,
      updatedAt: now
    }
    try {
      const result = await couchDB.updateDocument(current._id, updated, current._rev!)
      return { ...updated, _rev: result.rev }
    }
    catch (error) {
      if (!isCouchConflict(error)) throw error
    }
  }
  throw new TaskConflictError('The activation was modified concurrently; retry the operation.')
}
