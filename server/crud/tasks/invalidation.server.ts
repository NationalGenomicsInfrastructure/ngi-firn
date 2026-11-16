/*
 * Invalidation of task steps when the inventory they refer to is deleted.
 *
 * Deleting inventory always wins over planned task work: a delete is never blocked by a task hold.
 * Instead, every still-open step that has the deleted object as its target or as its move/locate
 * destination is cancelled (the task itself is kept, so there is a record of why the work vanished),
 * the cancellation cascades to the steps that depended on it, the holds those steps still carried on
 * OTHER inventory are released, and the affected activations are recomputed.
 *
 * Imported by the inventory services, so it must not import them (see stepState.server.ts).
 */
import { couchDB } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { TaskActivationDocument, TaskStepDocument } from '../../../types/productivity'
import { toUserRef } from '../users.server'
import {
  isOpenStepState,
  loadActivationsForTask,
  loadStepsForTask,
  refreshActivationState,
  releaseStepHolds,
  writeStepOutcome
} from './stepState.server'

const DELETED_REASON = 'Cancelled because its target or destination was deleted from the inventory.'
const PREREQUISITE_REASON = 'Cancelled because a prerequisite step lost its target or destination.'

async function stepsReferring(view: 'steps_by_target' | 'steps_by_destination', resourceId: string): Promise<TaskStepDocument[]> {
  const rows = (await couchDB.queryView<string, null, TaskStepDocument>('firn-tasks', view, {
    key: resourceId,
    include_docs: true
  })).rows
  return rows.map(r => r.doc).filter((d): d is TaskStepDocument => !!d && d.type === 'taskStep')
}

/*
 * Cancel every open step that refers to `resourceId` (plus the steps depending on them) and release
 * what they held. Returns the public ids of the cancelled steps. `actor` is the user whose action
 * removed the resource, recorded on each cancelled step; null when unknown.
 */
export async function invalidateStepsForDeletedResource(
  resourceId: string,
  actor: FirnUser | null
): Promise<string[]> {
  const referring = [
    ...await stepsReferring('steps_by_target', resourceId),
    ...await stepsReferring('steps_by_destination', resourceId)
  ].filter(step => isOpenStepState(step.state))
  if (referring.length === 0) return []

  const cancelled: string[] = []
  const taskIds = [...new Set(referring.map(step => step.task.id))]

  for (const taskId of taskIds) {
    const steps = await loadStepsForTask(taskId)
    const direct = new Set(referring.filter(step => step.task.id === taskId).map(step => step.stepId))

    // Cascade: an open step whose prerequisite is being cancelled can never run either.
    const doomed = new Set(direct)
    let grew = true
    while (grew) {
      grew = false
      for (const step of steps) {
        if (doomed.has(step.stepId) || !isOpenStepState(step.state)) continue
        if (step.dependsOn.some(depId => doomed.has(depId))) {
          doomed.add(step.stepId)
          grew = true
        }
      }
    }

    const activations = (await loadActivationsForTask(taskId))
      .filter(activation => activation.state === 'active' || activation.state === 'needs_reconciliation')
    const touched = new Map<string, TaskActivationDocument>()

    for (const step of steps) {
      if (!doomed.has(step.stepId) || !isOpenStepState(step.state)) continue

      // An activated step still carries holds on the inventory that was NOT deleted; release them.
      const activation = step.state === 'planned'
        ? undefined
        : activations.find(candidate => candidate.manifest.some(entry => entry.stepId === step.stepId))
      if (activation) {
        const payload = activation.manifest.find(entry => entry.stepId === step.stepId)?.snapshot ?? step.payload
        if (payload.kind === 'inventory') {
          await releaseStepHolds(payload, activation.activationId, step.stepId, activation.activationVersion, null)
        }
        touched.set(activation._id, activation)
      }

      await writeStepOutcome(step, 'cancelled', {
        result: 'cancelled',
        performedBy: actor ? toUserRef(actor) : null,
        performedAt: null,
        recordedAt: new Date().toISOString(),
        source: 'online',
        notes: direct.has(step.stepId) ? DELETED_REASON : PREREQUISITE_REASON,
        operationId: null,
        receiptLogRef: null,
        failureReason: null
      })
      cancelled.push(step.stepId)
    }

    for (const activationDocId of touched.keys()) {
      await refreshActivationState(activationDocId)
    }
  }
  return cancelled
}

/*
 * Delete-path wrapper: run the invalidation after an inventory document was deleted, without ever
 * failing the delete that already happened. A step missed here is still caught by the safety net at
 * activation and confirmation, which cancel a step whose target or destination no longer exists.
 */
export async function invalidateStepsAfterDelete(resourceId: string, actor: FirnUser | null): Promise<void> {
  try {
    await invalidateStepsForDeletedResource(resourceId, actor)
  }
  catch (error) {
    console.error(`Failed to cancel task steps referring to deleted inventory "${resourceId}":`, error)
  }
}
