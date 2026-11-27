/*
 * Integration tests for task activation execution and recovery (Phase 4): per-step
 * confirm/skip, batch confirmation in dependency order, cancellation with physical
 * declarations, handover and reconciliation. Runs against the isolated test CouchDB
 * (see tests/setup/integration.ts).
 *
 * Scope follows the small-user-base directive: these verify functional behaviour and
 * the Phase 4 acceptance criteria (no double action/log/count on retries, confirmed
 * physical work is recorded through the executor's own holds, skips never mutate the
 * inventory, and source/destination holds last until safely consumed/released), not
 * elaborate concurrency races.
 *
 * Cases share one base fixture and create their own throwaway task/steps/items, so the
 * suite runs sequentially (see vitest.config.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { couchDB } from '../../server/database/couchdb'
import { UserService } from '../../server/crud/users.server'
import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import { TaskService } from '../../server/crud/tasks/tasks.server'
import { TaskStepService } from '../../server/crud/tasks/steps.server'
import { TaskActivationService, findActivation } from '../../server/crud/tasks/activation.server'
import { TaskExecutionService } from '../../server/crud/tasks/execution.server'
import { TaskRecoveryService } from '../../server/crud/tasks/recovery.server'
import { TaskValidationError } from '../../server/crud/tasks/common'
import { AuthorizationError, ForbiddenError } from '../../server/auth/errors'
import { operationDocId } from '../../server/crud/tasks/operations.server'
import type { Container, InventoryItem, StorageEquipment } from '../../types/inventory'
import type { FirnUser } from '../../types/auth'
import type { StepPayloadInput } from '../../schemas/tasks/steps'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []
const createdTaskIds: string[] = []
const usedOpIds: string[] = []

let owner: FirnUser
let colleague: FirnUser
let equip: StorageEquipment
let boxA: Container
let boxB: Container

// Operation documents are keyed by operation id, so ids must not repeat across runs: a document
// left behind by an interrupted run would otherwise be mistaken for a replay.
const RUN_ID = Math.random().toString(36).slice(2, 10)
let opSeq = 0
function opId(prefix = 'op'): string {
  const id = `OP-EXEC-${RUN_ID}-${prefix}-${opSeq++}`
  usedOpIds.push(id)
  return id
}

async function makeUser(label: string): Promise<FirnUser> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const user = await UserService.createUserByAdmin({
    googleGivenName: label,
    googleFamilyName: 'ExecTester',
    googleEmail: `bctest-exec-${label.toLowerCase()}-${suffix}@scilifelab.se`,
    isAdmin: false
  })
  if (!user) throw new Error(`Failed to create the ${label} user fixture.`)
  createdIds.push(user._id)
  return user
}

/* Create a fresh cryovial in boxA, tracked for cleanup. */
async function makeVial(name: string): Promise<InventoryItem> {
  const vial = await ItemService.createItem({
    category: 'cryovial', name, parentSlug: boxA.slug, parentKind: 'container'
  }, owner)
  createdIds.push(vial._id)
  return vial
}

function checkoutStep(item: InventoryItem): StepPayloadInput {
  return { kind: 'inventory', action: 'checkout', target: { kind: 'item', slug: item.slug } }
}

function moveStep(item: InventoryItem, dest: Container): StepPayloadInput {
  return {
    kind: 'inventory',
    action: 'move',
    target: { kind: 'item', slug: item.slug },
    destination: { kind: 'container', slug: dest.slug, position: null }
  }
}

interface ActiveTask {
  slug: string
  taskId: string
  steps: Awaited<ReturnType<typeof TaskStepService.addSteps>>
  activationId: string
}

/*
 * Create an owner-owned task with the given step payloads, publish it and activate every step
 * (owner is the executor). `configure` runs between adding steps and publishing, e.g. to set
 * dependencies or sharing.
 */
async function makeActiveTask(
  title: string,
  payloads: StepPayloadInput[],
  configure?: (slug: string, steps: ActiveTask['steps']) => Promise<void>
): Promise<ActiveTask> {
  const task = await TaskService.createTask(owner, { title })
  createdIds.push(task._id)
  createdTaskIds.push(task._id)

  const steps = await TaskStepService.addSteps(owner, task.slug, payloads.map(p => ({ payload: p })))
  for (const step of steps) createdIds.push(step._id)

  if (configure) await configure(task.slug, steps)

  await TaskService.publishTask(owner, task.slug)
  const activation = await TaskActivationService.activateSteps(owner, task.slug, {
    stepIds: steps.map(s => s.stepId),
    operationId: opId('act')
  })
  return { slug: task.slug, taskId: task._id, steps, activationId: activation.activationId }
}

/* Number of action-log receipts on an item stamped with the given operation id. */
async function receiptCount(itemSlug: string, operationId: string): Promise<number> {
  const item = await ItemService.getItemBySlug(itemSlug)
  return (item?.actionLog ?? []).filter(entry => entry.operationId === operationId).length
}

beforeAll(async () => {
  const base = await setupBaseFixture()
  owner = base.user
  createdIds.push(...base.createdIds)

  colleague = await makeUser('Colleague')

  equip = await EquipmentService.createEquipment({
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    name: 'BCTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)

  boxA = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name: 'BCTEST Box A',
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 60 }]
  }, owner)
  createdIds.push(boxA._id)

  boxB = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name: 'BCTEST Box B',
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 20 }]
  }, owner)
  createdIds.push(boxB._id)
})

afterAll(async () => {
  // Best-effort removal of the auxiliary activation and operation documents the services created,
  // before the ordinary fixture teardown deletes the tasks, steps, items and inventory host.
  for (const taskId of createdTaskIds) {
    const rows = (await couchDB.queryView<[string, string], null, { _id: string, _rev: string }>(
      'firn-tasks', 'activations_by_task',
      { startkey: [taskId, ''], endkey: [taskId, '\ufff0'], include_docs: true }
    )).rows
    for (const row of rows) if (row.doc?._id) createdIds.push(row.doc._id)
  }
  // Operation documents are keyed by their operation id (batch per-step ids never get a document).
  for (const id of usedOpIds) createdIds.push(operationDocId(id))
  await cleanupFixture(createdIds)
})

describe('per-step confirmation', () => {
  it('applies the stored action once, records the outcome and releases the hold', async () => {
    const vial = await makeVial('BCTEST Confirm Vial')
    const { slug, activationId } = await makeActiveTask('BCTEST Confirm', [checkoutStep(vial)])
    const stepId = (await TaskStepService.listSteps(owner, slug))[0]!.stepId

    // While held, an ordinary checkout is refused: the hold protects the planned work.
    await expect(ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'checkout'
    } as Parameters<typeof ItemService.alterItem>[0], owner)).rejects.toThrow(/reserved/i)

    const confirmOp = opId('confirm')
    const confirmed = await TaskExecutionService.confirmStep(owner, slug, {
      stepId, activationId, operationId: confirmOp, source: 'online'
    })
    expect(confirmed.state).toBe('completed')

    // The physical action ran exactly once and stamped a receipt with the operation id.
    const after = await ItemService.getItemBySlug(vial.slug)
    expect(after?.status).toBe('in_use')
    expect(await receiptCount(vial.slug, confirmOp)).toBe(1)

    // The hold is gone: ordinary writes work again (return it to available).
    const returned = await ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'return'
    } as Parameters<typeof ItemService.alterItem>[0], owner)
    expect(returned[0]?.status).toBe('available')
  })

  it('is idempotent across a retry with the same operation id (no double action/log)', async () => {
    const vial = await makeVial('BCTEST Retry Vial')
    const { slug, activationId } = await makeActiveTask('BCTEST Retry', [checkoutStep(vial)])
    const stepId = (await TaskStepService.listSteps(owner, slug))[0]!.stepId

    const confirmOp = opId('retry')
    await TaskExecutionService.confirmStep(owner, slug, { stepId, activationId, operationId: confirmOp, source: 'online' })
    // Replaying the identical operation returns the stored result and never re-applies the action.
    const replay = await TaskExecutionService.confirmStep(owner, slug, { stepId, activationId, operationId: confirmOp, source: 'online' })
    expect(replay.state).toBe('completed')

    expect(await receiptCount(vial.slug, confirmOp)).toBe(1)
  })
})

describe('skipping', () => {
  it('never moves or changes the target and releases the hold', async () => {
    const vial = await makeVial('BCTEST Skip Vial')
    const before = await ItemService.getItemBySlug(vial.slug)
    const { slug, activationId } = await makeActiveTask('BCTEST Skip', [moveStep(vial, boxB)])
    const stepId = (await TaskStepService.listSteps(owner, slug))[0]!.stepId

    const skipped = await TaskExecutionService.skipStep(owner, slug, {
      stepId, activationId, operationId: opId('skip'), source: 'online'
    })
    expect(skipped.state).toBe('skipped')

    // Location, parent and status are untouched by a skip.
    const after = await ItemService.getItemBySlug(vial.slug)
    expect(after?.parent?.id).toBe(before?.parent?.id)
    expect(after?.status).toBe(before?.status)

    // Hold released: an ordinary move into boxB now succeeds.
    const moved = await ItemService.moveItem({
      itemSlug: [vial.slug], newParentSlug: boxB.slug, newParentKind: 'container', position: null
    }, owner)
    expect(moved[0]?.parent?.id).toBe(boxB._id)
  })
})

describe('batch confirmation', () => {
  it('confirms steps in dependency order and reports per-step dispositions', async () => {
    const first = await makeVial('BCTEST Batch First')
    const second = await makeVial('BCTEST Batch Second')
    const { slug, steps, activationId } = await makeActiveTask(
      'BCTEST Batch order',
      [checkoutStep(first), checkoutStep(second)],
      async (taskSlug, created) => {
        // Second depends on first, so the batch must confirm first before second.
        await TaskStepService.setDependencies(owner, taskSlug, created[1]!.stepId, [created[0]!.stepId])
      }
    )

    const result = await TaskExecutionService.confirmBatch(owner, slug, {
      activationId, operationId: opId('batch'), source: 'online'
    })
    const order = result.results.map(r => r.stepId)
    expect(order).toEqual([steps[0]!.stepId, steps[1]!.stepId])
    expect(result.results.every(r => r.status === 'completed')).toBe(true)
  })

  it('blocks a step whose prerequisite was skipped, without aborting the batch', async () => {
    const lead = await makeVial('BCTEST Batch Lead')
    const follow = await makeVial('BCTEST Batch Follow')
    const { slug, steps, activationId } = await makeActiveTask(
      'BCTEST Batch blocked',
      [checkoutStep(lead), checkoutStep(follow)],
      async (taskSlug, created) => {
        await TaskStepService.setDependencies(owner, taskSlug, created[1]!.stepId, [created[0]!.stepId])
      }
    )

    // Skip the prerequisite: a skipped step is never treated as physically completed.
    await TaskExecutionService.skipStep(owner, slug, {
      stepId: steps[0]!.stepId, activationId, operationId: opId('batch-skip'), source: 'online'
    })

    const result = await TaskExecutionService.confirmBatch(owner, slug, {
      activationId, operationId: opId('batch2'), source: 'online'
    })
    const byStep = new Map(result.results.map(r => [r.stepId, r.status]))
    expect(byStep.get(steps[0]!.stepId)).toBe('already_resolved')
    expect(byStep.get(steps[1]!.stepId)).toBe('blocked')
  })
})

describe('retries', () => {
  it('runs the body once when the same operation id arrives twice at the same time', async () => {
    const vial = await makeVial('BCTEST Concurrent Vial')
    const { slug, steps, activationId } = await makeActiveTask('BCTEST Concurrent', [checkoutStep(vial)])
    const request = { stepId: steps[0]!.stepId, activationId, operationId: opId('concurrent'), source: 'online' as const }

    const outcomes = await Promise.allSettled([
      TaskExecutionService.confirmStep(owner, slug, request),
      TaskExecutionService.confirmStep(owner, slug, request)
    ])
    // At least one request wins; the other either replays its result or is told to retry.
    expect(outcomes.some(o => o.status === 'fulfilled')).toBe(true)
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') expect(String(outcome.reason)).toMatch(/still running/i)
    }

    const item = await ItemService.getItemBySlug(vial.slug)
    expect(item?.status).toBe('in_use')
    expect((item?.actionLog ?? []).filter(entry => entry.linkedStepId === steps[0]!.stepId)).toHaveLength(1)

    // Once it has finished, the same request simply replays.
    const replay = await TaskExecutionService.confirmStep(owner, slug, request)
    expect(replay.state).toBe('completed')
  })

  it('replays a batch whose first response was lost after it finished the activation', async () => {
    const vial = await makeVial('BCTEST Batch Replay')
    const { slug, taskId, activationId } = await makeActiveTask('BCTEST Batch replay', [checkoutStep(vial)])
    const request = { activationId, operationId: opId('batch-replay'), source: 'online' as const }

    const first = await TaskExecutionService.confirmBatch(owner, slug, request)
    expect((await findActivation(taskId, activationId))?.state).toBe('finished')

    const replay = await TaskExecutionService.confirmBatch(owner, slug, request)
    expect(replay.results).toEqual(first.results)
  })

  it('re-runs a partially failed batch without applying the committed action twice', async () => {
    const vial = await makeVial('BCTEST Batch Partial')
    const other = await makeVial('BCTEST Batch Partial Other')
    const { slug, steps, taskId, activationId } = await makeActiveTask(
      'BCTEST Batch partial', [checkoutStep(vial), checkoutStep(other)]
    )
    const failing = steps[0]!

    // The checkout of the first vial commits, but recording the step outcome then fails.
    const original = couchDB.updateDocument.bind(couchDB)
    const spy = vi.spyOn(couchDB, 'updateDocument').mockImplementation(async (id, doc, rev) => {
      if (id === failing._id && (doc as { state?: string }).state === 'completed') {
        throw new Error('Simulated outcome failure')
      }
      return original(id, doc as never, rev)
    })
    const firstOp = opId('batch-partial')
    let first: Awaited<ReturnType<typeof TaskExecutionService.confirmBatch>>
    try {
      first = await TaskExecutionService.confirmBatch(owner, slug, { activationId, operationId: firstOp, source: 'online' })
    }
    finally {
      spy.mockRestore()
    }
    const byStep = new Map(first.results.map(r => [r.stepId, r.status]))
    expect(byStep.get(failing.stepId)).toBe('failed')
    expect(byStep.get(steps[1]!.stepId)).toBe('completed')
    expect((await ItemService.getItemBySlug(vial.slug))?.status).toBe('in_use')

    // Retrying the SAME operation runs again (it is not a replay of the partial result) and finishes
    // the step without checking the vial out a second time.
    const retry = await TaskExecutionService.confirmBatch(owner, slug, { activationId, operationId: firstOp, source: 'online' })
    expect(retry.results.find(r => r.stepId === failing.stepId)?.status).toBe('completed')
    const receipts = ((await ItemService.getItemBySlug(vial.slug))?.actionLog ?? [])
      .filter(entry => entry.linkedStepId === failing.stepId)
    expect(receipts).toHaveLength(1)
    expect((await findActivation(taskId, activationId))?.state).toBe('finished')
  })

  it('does not re-apply a committed action when the retry uses a new operation id', async () => {
    const vial = await makeVial('BCTEST New Op Retry')
    const { slug, steps, activationId } = await makeActiveTask('BCTEST New op retry', [checkoutStep(vial)])
    const step = steps[0]!

    const original = couchDB.updateDocument.bind(couchDB)
    const spy = vi.spyOn(couchDB, 'updateDocument').mockImplementation(async (id, doc, rev) => {
      if (id === step._id && (doc as { state?: string }).state === 'completed') {
        throw new Error('Simulated outcome failure')
      }
      return original(id, doc as never, rev)
    })
    try {
      await expect(TaskExecutionService.confirmStep(owner, slug, {
        stepId: step.stepId, activationId, operationId: opId('new-op-1'), source: 'online'
      })).rejects.toThrow(/Simulated outcome failure/)
    }
    finally {
      spy.mockRestore()
    }

    const retried = await TaskExecutionService.confirmStep(owner, slug, {
      stepId: step.stepId, activationId, operationId: opId('new-op-2'), source: 'online'
    })
    expect(retried.state).toBe('completed')
    const receipts = ((await ItemService.getItemBySlug(vial.slug))?.actionLog ?? [])
      .filter(entry => entry.linkedStepId === step.stepId)
    expect(receipts).toHaveLength(1)
  })
})

describe('cancellation', () => {
  it('releases holds and cancels steps when nothing was physically performed', async () => {
    const vial = await makeVial('BCTEST Cancel Clean')
    const { slug, steps, activationId } = await makeActiveTask('BCTEST Cancel clean', [checkoutStep(vial)])

    const display = await TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel'), reason: 'Plan abandoned',
      declarations: [{ stepId: steps[0]!.stepId, physicallyPerformed: false }]
    })
    expect(display.state).toBe('cancelled')

    // Hold released: ordinary checkout works again.
    const checked = await ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'checkout'
    } as Parameters<typeof ItemService.alterItem>[0], owner)
    expect(checked[0]?.status).toBe('in_use')
  })

  it('retains holds and needs reconciliation when work was declared performed', async () => {
    const vial = await makeVial('BCTEST Cancel Dirty')
    const { slug, steps, taskId, activationId } = await makeActiveTask('BCTEST Cancel dirty', [checkoutStep(vial)])

    const display = await TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-dirty'), reason: 'Already done by hand',
      declarations: [{ stepId: steps[0]!.stepId, physicallyPerformed: true }]
    })
    expect(display.state).toBe('needs_reconciliation')

    // The hold is retained, so an ordinary checkout is still refused.
    await expect(ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'checkout'
    } as Parameters<typeof ItemService.alterItem>[0], owner)).rejects.toThrow(/reserved/i)

    // Reconcile the step as completed: the checkout happened in the real world but was never
    // recorded, so reconciliation applies it to the inventory and releases the retained hold.
    const reconciled = await TaskRecoveryService.reconcile(owner, slug, {
      activationId, operationId: opId('reconcile'),
      resolutions: [{ stepId: steps[0]!.stepId, result: 'completed' }]
    })
    expect(reconciled.state).toBe('finished')

    // The step document is the single source of step state; the activation's claims are released.
    expect((await TaskStepService.listSteps(owner, slug))[0]?.state).toBe('completed')
    const activation = await findActivation(taskId, activationId)
    expect(activation?.reservationManifest.every(claim => claim.state === 'released')).toBe(true)

    // The inventory now shows the vial as checked out, exactly once, stamped as this step's receipt.
    const reconciledVial = await ItemService.getItemBySlug(vial.slug)
    expect(reconciledVial?.status).toBe('in_use')
    expect((reconciledVial?.actionLog ?? []).filter(entry => entry.linkedStepId === steps[0]!.stepId)).toHaveLength(1)

    // Hold released by reconciliation: an ordinary return now succeeds.
    const returned = await ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'return'
    } as Parameters<typeof ItemService.alterItem>[0], owner)
    expect(returned[0]?.status).toBe('available')
  })

  it('moves the item when a move declared performed is reconciled as completed, and not when skipped', async () => {
    const moved = await makeVial('BCTEST Reconcile Moved')
    const stayed = await makeVial('BCTEST Reconcile Stayed')
    const { slug, steps, activationId } = await makeActiveTask(
      'BCTEST Reconcile move', [moveStep(moved, boxB), moveStep(stayed, boxB)]
    )
    await TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-move'), reason: 'Moved by hand',
      declarations: steps.map(s => ({ stepId: s.stepId, physicallyPerformed: true }))
    })

    const reconciled = await TaskRecoveryService.reconcile(owner, slug, {
      activationId, operationId: opId('reconcile-move'),
      resolutions: [
        { stepId: steps[0]!.stepId, result: 'completed' },
        { stepId: steps[1]!.stepId, result: 'skipped' }
      ]
    })
    expect(reconciled.state).toBe('finished')
    expect((await ItemService.getItemBySlug(moved.slug))?.parent?.id).toBe(boxB._id)
    expect((await ItemService.getItemBySlug(stayed.slug))?.parent?.id).toBe(boxA._id)
    expect((await ContainerService.getContainerBySlug(boxB.slug))?.reservations ?? null).toBeNull()
  })

  it('refuses to cancel or archive a task while its activation is in progress', async () => {
    const vial = await makeVial('BCTEST Task Cancel Blocked')
    const { slug, steps, activationId } = await makeActiveTask('BCTEST Task cancel blocked', [checkoutStep(vial)])

    await expect(TaskService.cancelTask(owner, slug)).rejects.toThrow(/in progress/i)
    await expect(TaskService.archiveTask(owner, slug)).rejects.toThrow(/in progress/i)

    // Once the activation is cancelled explicitly, the task can be cancelled, and then nothing runs.
    await TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-for-task'), reason: 'Abandon',
      declarations: [{ stepId: steps[0]!.stepId, physicallyPerformed: false }]
    })
    const cancelled = await TaskService.cancelTask(owner, slug)
    expect(cancelled.status).toBe('cancelled')

    await expect(TaskExecutionService.confirmStep(owner, slug, {
      stepId: steps[0]!.stepId, activationId, operationId: opId('after-task-cancel'), source: 'online'
    })).rejects.toThrow(/cancelled/i)
    await expect(TaskStepService.addSteps(owner, slug, [{ payload: checkoutStep(vial) }]))
      .rejects.toThrow(/cancelled task/i)
  })

  it('requires a declaration for every live step before cancelling', async () => {
    const vial = await makeVial('BCTEST Cancel Undeclared')
    const { slug, activationId } = await makeActiveTask('BCTEST Cancel undeclared', [checkoutStep(vial)])

    await expect(TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-bad'), reason: 'Oops', declarations: []
    })).rejects.toBeInstanceOf(TaskValidationError)
  })
})

describe('activation state follows the step documents', () => {
  it('finishes the activation when two steps are reconciled in one request', async () => {
    const first = await makeVial('BCTEST Reconcile Two A')
    const second = await makeVial('BCTEST Reconcile Two B')
    const { slug, steps, taskId, activationId } = await makeActiveTask(
      'BCTEST Reconcile two', [checkoutStep(first), checkoutStep(second)]
    )

    await TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-two'), reason: 'Done by hand',
      declarations: steps.map(s => ({ stepId: s.stepId, physicallyPerformed: true }))
    })
    const reconciled = await TaskRecoveryService.reconcile(owner, slug, {
      activationId, operationId: opId('reconcile-two'),
      resolutions: steps.map(s => ({ stepId: s.stepId, result: 'skipped' as const }))
    })
    expect(reconciled.state).toBe('finished')
    expect(reconciled.steps.map(s => s.state)).toEqual(['skipped', 'skipped'])

    const activation = await findActivation(taskId, activationId)
    expect(activation?.reservationManifest.every(claim => claim.state === 'released')).toBe(true)
  })

  it('leaves needs_reconciliation after a mixed cancel once the performed step is reconciled', async () => {
    const done = await makeVial('BCTEST Mixed Done')
    const untouched = await makeVial('BCTEST Mixed Untouched')
    const { slug, steps, activationId } = await makeActiveTask(
      'BCTEST Mixed cancel', [checkoutStep(done), checkoutStep(untouched)]
    )

    const cancelled = await TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-mixed'), reason: 'Half done',
      declarations: [
        { stepId: steps[0]!.stepId, physicallyPerformed: true },
        { stepId: steps[1]!.stepId, physicallyPerformed: false }
      ]
    })
    expect(cancelled.state).toBe('needs_reconciliation')

    const reconciled = await TaskRecoveryService.reconcile(owner, slug, {
      activationId, operationId: opId('reconcile-mixed'),
      resolutions: [{ stepId: steps[0]!.stepId, result: 'skipped' }]
    })
    expect(reconciled.state).toBe('finished')
  })

  it('refuses to cancel a finished activation', async () => {
    const vial = await makeVial('BCTEST Cancel Finished')
    const { slug, steps, taskId, activationId } = await makeActiveTask('BCTEST Cancel finished', [checkoutStep(vial)])
    await TaskExecutionService.confirmStep(owner, slug, {
      stepId: steps[0]!.stepId, activationId, operationId: opId('finish'), source: 'online'
    })
    expect((await findActivation(taskId, activationId))?.state).toBe('finished')

    await expect(TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-finished'), reason: 'Too late', declarations: []
    })).rejects.toBeInstanceOf(TaskValidationError)
    expect((await findActivation(taskId, activationId))?.state).toBe('finished')
  })

  it('returns steps to planned and releases holds when activation fails half-way', async () => {
    const first = await makeVial('BCTEST Rollback A')
    const second = await makeVial('BCTEST Rollback B')
    const task = await TaskService.createTask(owner, { title: 'BCTEST Activation rollback' })
    createdIds.push(task._id)
    createdTaskIds.push(task._id)
    const steps = await TaskStepService.addSteps(owner, task.slug, [
      { payload: checkoutStep(first) }, { payload: checkoutStep(second) }
    ])
    for (const step of steps) createdIds.push(step._id)
    await TaskService.publishTask(owner, task.slug)

    // Fail the write that marks the second step held, after the first one succeeded.
    const original = couchDB.updateDocument.bind(couchDB)
    const spy = vi.spyOn(couchDB, 'updateDocument').mockImplementation(async (id, doc, rev) => {
      if (id === steps[1]!._id && (doc as { state?: string }).state === 'held') {
        throw new Error('Simulated database failure')
      }
      return original(id, doc as never, rev)
    })
    try {
      await expect(TaskActivationService.activateSteps(owner, task.slug, {
        stepIds: steps.map(s => s.stepId), operationId: opId('act-fail')
      })).rejects.toThrow(/Simulated database failure/)
    }
    finally {
      spy.mockRestore()
    }

    const after = await TaskStepService.listSteps(owner, task.slug)
    expect(after.map(s => s.state)).toEqual(['planned', 'planned'])

    // Nothing is stuck: the same steps can be activated again.
    const retry = await TaskActivationService.activateSteps(owner, task.slug, {
      stepIds: steps.map(s => s.stepId), operationId: opId('act-retry')
    })
    expect(retry.state).toBe('active')
  })
})

describe('handover', () => {
  it('advances the version, swaps the executor and keeps the hold, so only the new executor can confirm', async () => {
    const vial = await makeVial('BCTEST Handover Vial')
    const { slug, steps, taskId, activationId } = await makeActiveTask(
      'BCTEST Handover',
      [checkoutStep(vial)],
      async (taskSlug) => {
        await TaskService.setSharing(owner, taskSlug, { responsibleFirnIds: [colleague.firnId] })
      }
    )

    const handed = await TaskRecoveryService.handover(owner, slug, {
      activationId, operationId: opId('handover'), toExecutorFirnId: colleague.firnId, acknowledged: true
    })
    expect(handed.activationVersion).toBe(2)

    const activation = await findActivation(taskId, activationId)
    expect(activation?.executor.id).toBe(colleague._id)
    expect(activation?.exports).toHaveLength(0)

    // The old executor can no longer confirm the handed-over work.
    await expect(TaskExecutionService.confirmStep(owner, slug, {
      stepId: steps[0]!.stepId, activationId, operationId: opId('old-exec'), source: 'online'
    })).rejects.toThrow(/activated this work/i)

    // The hold persists through handover (an ordinary checkout is still refused)...
    await expect(ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'checkout'
    } as Parameters<typeof ItemService.alterItem>[0], colleague)).rejects.toThrow(/reserved/i)

    // ...and the new executor confirms successfully under the advanced generation.
    const confirmed = await TaskExecutionService.confirmStep(colleague, slug, {
      stepId: steps[0]!.stepId, activationId, operationId: opId('new-exec'), source: 'online'
    })
    expect(confirmed.state).toBe('completed')
  })

  it('requires the current executor to acknowledge', async () => {
    const vial = await makeVial('BCTEST Handover NoAck')
    const { slug, activationId } = await makeActiveTask(
      'BCTEST Handover noack',
      [checkoutStep(vial)],
      async (taskSlug) => {
        await TaskService.setSharing(owner, taskSlug, { responsibleFirnIds: [colleague.firnId] })
      }
    )

    await expect(TaskRecoveryService.handover(owner, slug, {
      activationId, operationId: opId('handover-bad'), toExecutorFirnId: colleague.firnId, acknowledged: false
    })).rejects.toBeInstanceOf(TaskValidationError)
  })
})

describe('Task authorization', () => {
  it('rejects confirmation by a responsible colleague who is not the executor', async () => {
    const vial = await makeVial('BCTEST Authz NonExecutor')
    const { slug, activationId, steps } = await makeActiveTask(
      'BCTEST Authz non-executor',
      [checkoutStep(vial)],
      async (taskSlug) => {
        await TaskService.setSharing(owner, taskSlug, { responsibleFirnIds: [colleague.firnId] })
      }
    )

    await expect(TaskExecutionService.confirmStep(colleague, slug, {
      stepId: steps[0]!.stepId, activationId, operationId: opId('non-exec'), source: 'online'
    })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('refuses to remove the executor of a live activation from the task until it is cancelled', async () => {
    const vial = await makeVial('BCTEST Authz Revoke')
    const task = await TaskService.createTask(owner, { title: 'BCTEST Authz revoke', responsibleFirnIds: [colleague.firnId] })
    createdIds.push(task._id)
    createdTaskIds.push(task._id)
    const steps = await TaskStepService.addSteps(owner, task.slug, [{ payload: checkoutStep(vial) }])
    for (const step of steps) createdIds.push(step._id)
    await TaskService.publishTask(owner, task.slug)
    const activation = await TaskActivationService.activateSteps(colleague, task.slug, {
      stepIds: steps.map(s => s.stepId),
      operationId: opId('act')
    })

    await expect(TaskService.setSharing(owner, task.slug, { responsibleFirnIds: [] }))
      .rejects.toThrow(/currently executing activated work/i)
    await expect(TaskService.setSharing(owner, task.slug, { responsibleFirnIds: [] }))
      .rejects.toBeInstanceOf(TaskValidationError)
    await expect(TaskService.releaseResponsibility(colleague, task.slug))
      .rejects.toBeInstanceOf(TaskValidationError)

    await TaskRecoveryService.cancelActivation(colleague, task.slug, {
      activationId: activation.activationId,
      operationId: opId('cancel'),
      reason: 'Authorization test',
      declarations: steps.map(s => ({ stepId: s.stepId, physicallyPerformed: false }))
    })

    const updated = await TaskService.setSharing(owner, task.slug, { responsibleFirnIds: [] })
    expect(updated.responsibleUsers).toHaveLength(0)
  })

  it('reports actions as blocked exactly while the activation is live', async () => {
    const vial = await makeVial('BCTEST Authz Blocked Actions')
    const task = await TaskService.createTask(owner, { title: 'BCTEST Authz blocked actions', responsibleFirnIds: [colleague.firnId] })
    createdIds.push(task._id)
    createdTaskIds.push(task._id)
    const steps = await TaskStepService.addSteps(owner, task.slug, [{ payload: checkoutStep(vial) }])
    for (const step of steps) createdIds.push(step._id)
    await TaskService.publishTask(owner, task.slug)
    const activation = await TaskActivationService.activateSteps(colleague, task.slug, {
      stepIds: steps.map(s => s.stepId),
      operationId: opId('act')
    })

    const forOwner = await TaskService.getDisplayTask(owner, task.slug)
    const forExecutor = await TaskService.getDisplayTask(colleague, task.slug)
    expect(forOwner.actions.cancel?.blockedReason).toMatch(/in progress/i)
    expect(forOwner.actions.archive?.blockedReason).toMatch(/in progress/i)
    expect(forExecutor.actions.releaseResponsibility?.blockedReason).toBeTruthy()

    await TaskRecoveryService.cancelActivation(colleague, task.slug, {
      activationId: activation.activationId,
      operationId: opId('cancel'),
      reason: 'Blocked actions test',
      declarations: steps.map(s => ({ stepId: s.stepId, physicallyPerformed: false }))
    })

    expect((await TaskService.getDisplayTask(owner, task.slug)).actions.cancel?.blockedReason).toBeNull()
    expect((await TaskService.getDisplayTask(colleague, task.slug)).actions.releaseResponsibility?.blockedReason).toBeNull()
  })

  it('lets an inactive or unapproved account read nothing', async () => {
    const task = await TaskService.createTask(owner, { title: 'BCTEST Authz inactive', visibility: 'public' })
    createdIds.push(task._id)
    createdTaskIds.push(task._id)

    await expect(TaskService.requireReadableTask(owner, task.slug)).resolves.toBeDefined()
    // Even the owner of a public task loses access once the account is retired or login is revoked.
    await expect(TaskService.requireReadableTask({ ...owner, isRetired: true }, task.slug))
      .rejects.toBeInstanceOf(AuthorizationError)
    await expect(TaskService.requireReadableTask({ ...owner, allowLogin: false }, task.slug))
      .rejects.toBeInstanceOf(AuthorizationError)
  })
})
