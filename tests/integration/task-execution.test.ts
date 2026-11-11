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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
import type { Container, InventoryItem, StorageEquipment } from '../../types/inventory'
import type { FirnUser } from '../../types/auth'
import type { TaskStepPayload } from '../../types/productivity'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []
const createdTaskIds: string[] = []
const usedOpIds: string[] = []

let owner: FirnUser
let colleague: FirnUser
let equip: StorageEquipment
let boxA: Container
let boxB: Container

let opSeq = 0
function opId(prefix = 'op'): string {
  const id = `OP-EXEC-${prefix}-${opSeq++}`
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

function checkoutStep(item: InventoryItem): TaskStepPayload {
  return {
    kind: 'inventory',
    action: 'checkout',
    targetKind: 'item',
    target: {
      ref: { db: 'firn', id: item._id, type: 'inventoryItem' },
      slug: item.slug,
      name: item.name,
      pathLabel: 'BCTEST Freezer › BCTEST Box A'
    },
    expectedStatus: null,
    notes: null
  }
}

function moveStep(item: InventoryItem, dest: Container): TaskStepPayload {
  return {
    kind: 'inventory',
    action: 'move',
    targetKind: 'item',
    target: {
      ref: { db: 'firn', id: item._id, type: 'inventoryItem' },
      slug: item.slug,
      name: item.name,
      pathLabel: 'BCTEST Freezer › BCTEST Box A'
    },
    destination: {
      parent: {
        ref: { db: 'firn', id: dest._id, type: 'container' },
        slug: dest.slug,
        name: dest.name,
        pathLabel: 'BCTEST Freezer › BCTEST Box B'
      },
      position: null
    },
    expectedStatus: null,
    notes: null
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
  payloads: TaskStepPayload[],
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
    capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 20 }]
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
  for (const base of usedOpIds) {
    const rows = (await couchDB.queryView<string, null, { _id: string, _rev: string }>(
      'firn-tasks', 'operations_by_key',
      { startkey: base, endkey: `${base}\ufff0`, include_docs: true }
    )).rows
    for (const row of rows) if (row.doc?._id) createdIds.push(row.doc._id)
  }
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

    // Reconcile the step as completed: this records the disposition and releases the retained hold
    // without re-applying the physical action (it already happened in the real world).
    const reconciled = await TaskRecoveryService.reconcile(owner, slug, {
      activationId, operationId: opId('reconcile'),
      resolutions: [{ stepId: steps[0]!.stepId, result: 'completed' }]
    })
    expect(reconciled.state).toBe('finished')

    const activation = await findActivation(taskId, activationId)
    expect(activation?.manifest[0]?.state).toBe('completed')

    // Hold released by reconciliation: ordinary checkout now succeeds.
    const checked = await ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'checkout'
    } as Parameters<typeof ItemService.alterItem>[0], owner)
    expect(checked[0]?.status).toBe('in_use')
  })

  it('requires a declaration for every live step before cancelling', async () => {
    const vial = await makeVial('BCTEST Cancel Undeclared')
    const { slug, activationId } = await makeActiveTask('BCTEST Cancel undeclared', [checkoutStep(vial)])

    await expect(TaskRecoveryService.cancelActivation(owner, slug, {
      activationId, operationId: opId('cancel-bad'), reason: 'Oops', declarations: []
    })).rejects.toBeInstanceOf(TaskValidationError)
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
      activationId, operationId: opId('handover'), toExecutorId: colleague._id, acknowledged: true
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
      activationId, operationId: opId('handover-bad'), toExecutorId: colleague._id, acknowledged: false
    })).rejects.toBeInstanceOf(TaskValidationError)
  })
})
