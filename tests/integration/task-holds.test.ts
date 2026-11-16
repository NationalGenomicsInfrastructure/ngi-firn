/*
 * Integration tests for how task activations hold inventory end to end: claim identity between the
 * steps of one activation, destinations validated at activation, reservations that survive a failed
 * confirmation, and inventory deletes that cancel the steps referring to the deleted object.
 * Runs against the isolated test CouchDB (see tests/setup/integration.ts).
 *
 * Each case builds its own throwaway boxes, vials and task on a shared freezer fixture, so the suite
 * runs sequentially (see vitest.config.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { couchDB } from '../../server/database/couchdb'
import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import { TaskService } from '../../server/crud/tasks/tasks.server'
import { TaskStepService } from '../../server/crud/tasks/steps.server'
import { TaskActivationService, findActivation } from '../../server/crud/tasks/activation.server'
import { TaskExecutionService } from '../../server/crud/tasks/execution.server'
import { TaskValidationError } from '../../server/crud/tasks/common'
import { operationDocId } from '../../server/crud/tasks/operations.server'
import type { Container, GridPosition, InventoryItem, StorageEquipment } from '../../types/inventory'
import type { FirnUser } from '../../types/auth'
import type { TaskStepDocument, TaskStepPayload } from '../../types/productivity'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []
const createdTaskIds: string[] = []
const usedOpIds: string[] = []

let owner: FirnUser
let roomId: string
let equip: StorageEquipment
let source: Container

// Operation documents are keyed by operation id, so ids must not repeat across runs: a document
// left behind by an interrupted run would otherwise be mistaken for a replay.
const RUN_ID = Math.random().toString(36).slice(2, 10)
let opSeq = 0
function opId(prefix = 'op'): string {
  const id = `OP-HOLD-${RUN_ID}-${prefix}-${opSeq++}`
  usedOpIds.push(id)
  return id
}

async function makeVial(name: string): Promise<InventoryItem> {
  const vial = await ItemService.createItem({
    category: 'cryovial', name, parentSlug: source.slug, parentKind: 'container'
  }, owner)
  createdIds.push(vial._id)
  return vial
}

async function makeCountBox(name: string, capacity: number): Promise<Container> {
  const box = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name,
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity }]
  }, owner)
  createdIds.push(box._id)
  return box
}

async function makeGridBox(name: string, rows: number, columns: number): Promise<Container> {
  const box = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name,
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'grid', childKind: 'item', type: 'cryovial', rows, columns, levels: 1 }]
  }, owner)
  createdIds.push(box._id)
  return box
}

function targetRef(item: InventoryItem) {
  return {
    ref: { db: 'firn', id: item._id, type: 'inventoryItem' } as const,
    slug: item.slug,
    name: item.name,
    pathLabel: 'HOLDTEST Freezer › HOLDTEST Source'
  }
}

function alterStep(item: InventoryItem, action: 'checkout' | 'return'): TaskStepPayload {
  return { kind: 'inventory', action, targetKind: 'item', target: targetRef(item), expectedStatus: null, notes: null }
}

function moveStep(item: InventoryItem, dest: Container, position: GridPosition | null = null): TaskStepPayload {
  return {
    kind: 'inventory',
    action: 'move',
    targetKind: 'item',
    target: targetRef(item),
    destination: {
      parent: {
        ref: { db: 'firn', id: dest._id, type: 'container' },
        slug: dest.slug,
        name: dest.name,
        pathLabel: `HOLDTEST Freezer › ${dest.name}`
      },
      position
    },
    expectedStatus: null,
    notes: null
  }
}

interface PlannedTask {
  slug: string
  taskId: string
  steps: TaskStepDocument[]
}

/* Create and publish an owner-owned task with the given steps, without activating anything. */
async function makePlannedTask(
  title: string,
  payloads: TaskStepPayload[],
  dependencies: [number, number][] = []
): Promise<PlannedTask> {
  const task = await TaskService.createTask(owner, { title })
  createdIds.push(task._id)
  createdTaskIds.push(task._id)
  const steps = await TaskStepService.addSteps(owner, task.slug, payloads.map(payload => ({ payload })))
  for (const step of steps) createdIds.push(step._id)
  for (const [dependent, prerequisite] of dependencies) {
    await TaskStepService.setDependencies(owner, task.slug, steps[dependent]!.stepId, [steps[prerequisite]!.stepId])
  }
  await TaskService.publishTask(owner, task.slug)
  return { slug: task.slug, taskId: task._id, steps }
}

async function activateAll(task: PlannedTask): Promise<string> {
  const activation = await TaskActivationService.activateSteps(owner, task.slug, {
    stepIds: task.steps.map(s => s.stepId), operationId: opId('act')
  })
  return activation.activationId
}

async function stepStates(task: PlannedTask): Promise<string[]> {
  return (await TaskStepService.listSteps(owner, task.slug)).map(s => s.state)
}

async function reservationsOf(id: string): Promise<unknown> {
  const doc = await couchDB.getDocument<{ reservations?: unknown }>(id)
  return doc?.reservations ?? null
}

beforeAll(async () => {
  const base = await setupBaseFixture()
  owner = base.user
  roomId = base.room._id
  createdIds.push(...base.createdIds)

  equip = await EquipmentService.createEquipment({
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    name: 'HOLDTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 40 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)

  source = await makeCountBox('HOLDTEST Source', 60)
})

afterAll(async () => {
  for (const taskId of createdTaskIds) {
    const rows = (await couchDB.queryView<[string, string], null, { _id: string }>(
      'firn-tasks', 'activations_by_task',
      { startkey: [taskId, ''], endkey: [taskId, '￰'], include_docs: true }
    )).rows
    for (const row of rows) if (row.doc?._id) createdIds.push(row.doc._id)
  }
  // Operation documents are keyed by their operation id (batch per-step ids never get a document).
  for (const id of usedOpIds) createdIds.push(operationDocId(id))
  await cleanupFixture(createdIds)
})

describe('steps of one activation compete for a destination like strangers', () => {
  it('refuses two steps that target the same grid cell and rolls everything back', async () => {
    const grid = await makeGridBox('HOLDTEST Same Cell', 1, 2)
    const first = await makeVial('HOLDTEST Same Cell A')
    const second = await makeVial('HOLDTEST Same Cell B')
    const cell = { row: 1, column: 1, level: 1 }
    const task = await makePlannedTask('HOLDTEST same cell', [moveStep(first, grid, cell), moveStep(second, grid, cell)])

    await expect(activateAll(task)).rejects.toThrow(/reserved/i)

    expect(await stepStates(task)).toEqual(['planned', 'planned'])
    expect(await reservationsOf(grid._id)).toBeNull()
    expect(await reservationsOf(first._id)).toBeNull()
    expect(await reservationsOf(second._id)).toBeNull()
  })

  it('refuses two steps that need the last unit of count capacity', async () => {
    const box = await makeCountBox('HOLDTEST Last Unit', 1)
    const first = await makeVial('HOLDTEST Last Unit A')
    const second = await makeVial('HOLDTEST Last Unit B')
    const task = await makePlannedTask('HOLDTEST last unit', [moveStep(first, box), moveStep(second, box)])

    await expect(activateAll(task)).rejects.toThrow(/capacity/i)
    expect(await stepStates(task)).toEqual(['planned', 'planned'])
    expect(await reservationsOf(box._id)).toBeNull()
  })

  it('reserves a distinct cell per step when none was planned, and places into exactly that cell', async () => {
    const grid = await makeGridBox('HOLDTEST Auto Cells', 1, 2)
    const first = await makeVial('HOLDTEST Auto Cells A')
    const second = await makeVial('HOLDTEST Auto Cells B')
    const task = await makePlannedTask('HOLDTEST auto cells', [moveStep(first, grid), moveStep(second, grid)])
    const activationId = await activateAll(task)

    // The held steps show the reserved cells, so the executor knows where each tube goes.
    const held = await TaskStepService.listSteps(owner, task.slug)
    const cells = held.map(s => s.payload.kind === 'inventory' ? s.payload.destination?.position : null)
    expect(cells.map(c => [c?.row, c?.column])).toEqual([[1, 1], [1, 2]])

    const result = await TaskExecutionService.confirmBatch(owner, task.slug, {
      activationId, operationId: opId('auto-batch'), source: 'online'
    })
    expect(result.results.every(r => r.status === 'completed')).toBe(true)

    expect((await ItemService.getItemBySlug(first.slug))?.position).toMatchObject({ row: 1, column: 1 })
    expect((await ItemService.getItemBySlug(second.slug))?.position).toMatchObject({ row: 1, column: 2 })
    expect(await reservationsOf(grid._id)).toBeNull()
  })

  it('refuses a third position-less step when the grid has only two free cells', async () => {
    const grid = await makeGridBox('HOLDTEST Full Grid', 1, 2)
    const vials: InventoryItem[] = []
    for (const suffix of ['A', 'B', 'C']) vials.push(await makeVial(`HOLDTEST Full Grid ${suffix}`))
    const task = await makePlannedTask('HOLDTEST full grid', vials.map(vial => moveStep(vial, grid)))

    await expect(activateAll(task)).rejects.toThrow(/no free cell/i)
    expect(await stepStates(task)).toEqual(['planned', 'planned', 'planned'])
    expect(await reservationsOf(grid._id)).toBeNull()
  })
})

describe('one object in several steps of one activation', () => {
  it('activates checkout and return of the same item together and holds it until the last step', async () => {
    const vial = await makeVial('HOLDTEST Shared Hold')
    const task = await makePlannedTask(
      'HOLDTEST checkout then return',
      [alterStep(vial, 'checkout'), alterStep(vial, 'return')],
      [[1, 0]]
    )
    const activationId = await activateAll(task)

    await TaskExecutionService.confirmStep(owner, task.slug, {
      stepId: task.steps[0]!.stepId, activationId, operationId: opId('shared-1'), source: 'online'
    })
    expect((await ItemService.getItemBySlug(vial.slug))?.status).toBe('in_use')

    // Still held for the return step: an ordinary write is refused.
    await expect(ItemService.alterItem({
      itemSlug: [vial.slug], performedAction: 'return'
    } as Parameters<typeof ItemService.alterItem>[0], owner)).rejects.toThrow(/reserved/i)

    await TaskExecutionService.confirmStep(owner, task.slug, {
      stepId: task.steps[1]!.stepId, activationId, operationId: opId('shared-2'), source: 'online'
    })
    expect((await ItemService.getItemBySlug(vial.slug))?.status).toBe('available')
    expect(await reservationsOf(vial._id)).toBeNull()
    expect((await findActivation(task.taskId, activationId))?.state).toBe('finished')
  })
})

describe('destinations are validated at activation', () => {
  it('refuses an occupied cell, a cell outside the grid, and a room', async () => {
    const grid = await makeGridBox('HOLDTEST Validate', 1, 2)
    const occupant = await ItemService.createItem({
      category: 'cryovial', name: 'HOLDTEST Occupant', parentSlug: grid.slug, parentKind: 'container',
      position: { row: 1, column: 1, level: 1 }
    }, owner)
    createdIds.push(occupant._id)
    const vial = await makeVial('HOLDTEST Validate Vial')

    const occupied = await makePlannedTask('HOLDTEST occupied', [moveStep(vial, grid, { row: 1, column: 1, level: 1 })])
    await expect(activateAll(occupied)).rejects.toThrow(/occupied/i)

    const outside = await makePlannedTask('HOLDTEST outside', [moveStep(vial, grid, { row: 7, column: 7, level: 1 })])
    await expect(activateAll(outside)).rejects.toThrow(/outside/i)
    expect(await reservationsOf(vial._id)).toBeNull()

    // A room is rejected when the step is planned.
    const task = await TaskService.createTask(owner, { title: 'HOLDTEST room destination' })
    createdIds.push(task._id)
    createdTaskIds.push(task._id)
    const toRoom = moveStep(vial, grid) as Extract<TaskStepPayload, { action: 'move' }>
    const roomPayload = {
      ...toRoom,
      destination: { ...toRoom.destination, parent: { ...toRoom.destination.parent, ref: { db: 'firn', id: roomId, type: 'room' } } }
    } as unknown as TaskStepPayload
    await expect(TaskStepService.addSteps(owner, task.slug, [{ payload: roomPayload }]))
      .rejects.toBeInstanceOf(TaskValidationError)
  })
})

describe('a failed confirmation keeps its reservation', () => {
  it('leaves the destination claim in place so nobody takes the slot, and a retry succeeds', async () => {
    const box = await makeCountBox('HOLDTEST Keep Claim', 1)
    const vial = await makeVial('HOLDTEST Keep Claim Vial')
    const intruder = await makeVial('HOLDTEST Keep Claim Intruder')
    const task = await makePlannedTask('HOLDTEST keep claim', [moveStep(vial, box)])
    const activationId = await activateAll(task)
    const stepId = task.steps[0]!.stepId

    // Fail the write that re-homes the vial into the destination box.
    const original = couchDB.updateDocument.bind(couchDB)
    const spy = vi.spyOn(couchDB, 'updateDocument').mockImplementation(async (id, doc, rev) => {
      if (id === vial._id && (doc as { parent?: { id?: string } }).parent?.id === box._id) {
        throw new Error('Simulated move failure')
      }
      return original(id, doc as never, rev)
    })
    try {
      await expect(TaskExecutionService.confirmStep(owner, task.slug, {
        stepId, activationId, operationId: opId('keep-fail'), source: 'online'
      })).rejects.toThrow(/Simulated move failure/)
    }
    finally {
      spy.mockRestore()
    }

    // The step is still held and its reservation is intact: the only slot is not up for grabs.
    expect(await stepStates(task)).toEqual(['held'])
    const claimed = await ContainerService.getContainerBySlug(box.slug)
    expect(claimed?.reservations?.capacityClaims).toHaveLength(1)
    expect(claimed?.capacity?.[0]?.stored).toBe(0)
    await expect(ItemService.moveItem({
      itemSlug: [intruder.slug], newParentSlug: box.slug, newParentKind: 'container', position: null
    }, owner)).rejects.toThrow(/room for 0|reserved/i)

    // The executor retries and the step completes into the reserved slot.
    const retried = await TaskExecutionService.confirmStep(owner, task.slug, {
      stepId, activationId, operationId: opId('keep-retry'), source: 'online'
    })
    expect(retried.state).toBe('completed')
    expect((await ItemService.getItemBySlug(vial.slug))?.parent?.id).toBe(box._id)
    expect(await reservationsOf(box._id)).toBeNull()
    expect(await reservationsOf(vial._id)).toBeNull()
  })

  it('still confirms after the destination box was renamed', async () => {
    const box = await makeCountBox('HOLDTEST Rename Me', 2)
    const vial = await makeVial('HOLDTEST Rename Vial')
    const task = await makePlannedTask('HOLDTEST rename', [moveStep(vial, box)])
    const activationId = await activateAll(task)

    // A claim only blocks occupying the slot; the box can be renamed (its slug changes with it).
    const renamed = await ContainerService.updateContainer({
      containerSlug: box.slug, name: 'HOLDTEST Renamed Box'
    } as Parameters<typeof ContainerService.updateContainer>[0], owner)
    expect(renamed.slug).not.toBe(box.slug)

    // The open step shows the box under its current name and path, not the planning-time snapshot.
    const shown = (await TaskStepService.listSteps(owner, task.slug))[0]!.payload
    const destination = shown.kind === 'inventory' ? shown.destination?.parent : null
    expect(destination?.entity).toMatchObject({ slug: renamed.slug, name: 'HOLDTEST Renamed Box' })
    expect(destination?.pathLabel).toBe('HOLDTEST Freezer › HOLDTEST Renamed Box')

    const confirmed = await TaskExecutionService.confirmStep(owner, task.slug, {
      stepId: task.steps[0]!.stepId, activationId, operationId: opId('rename-confirm'), source: 'online'
    })
    expect(confirmed.state).toBe('completed')
    expect((await ItemService.getItemBySlug(vial.slug))?.parent?.id).toBe(box._id)
  })
})

describe('ordinary batches respect reserved capacity', () => {
  it('fails a batch before any write when part of the destination is reserved', async () => {
    const box = await makeCountBox('HOLDTEST Batch Box', 2)
    const reservedFor = await makeVial('HOLDTEST Batch Reserved')
    const task = await makePlannedTask('HOLDTEST batch', [moveStep(reservedFor, box)])
    await activateAll(task)

    const a = await makeVial('HOLDTEST Batch A')
    const b = await makeVial('HOLDTEST Batch B')
    await expect(ItemService.moveItem({
      itemSlug: [a.slug, b.slug], newParentSlug: box.slug, newParentKind: 'container', position: null
    }, owner)).rejects.toThrow(/room for 1 more/i)

    // Nothing was moved: both are still in the source box.
    expect((await ItemService.getItemBySlug(a.slug))?.parent?.id).toBe(source._id)
    expect((await ItemService.getItemBySlug(b.slug))?.parent?.id).toBe(source._id)
  })
})

describe('deleting inventory wins over planned task work', () => {
  it('cancels the step and its dependents and releases what they held when a destination is deleted', async () => {
    const doomed = await makeCountBox('HOLDTEST Doomed Box', 3)
    const mover = await makeVial('HOLDTEST Doomed Mover')
    const follower = await makeVial('HOLDTEST Doomed Follower')
    const bystander = await makeVial('HOLDTEST Doomed Bystander')
    const task = await makePlannedTask(
      'HOLDTEST delete destination',
      [moveStep(mover, doomed), alterStep(follower, 'checkout'), alterStep(bystander, 'checkout')],
      [[1, 0]]
    )
    const activationId = await activateAll(task)

    // The box is empty, so the delete goes through although an active task has reserved a slot in it.
    const result = await ContainerService.deleteContainer({ containerSlug: [doomed.slug] }, owner)
    expect(result.failures).toEqual([])
    expect(result.deleted).toHaveLength(1)

    // The move and the step depending on it are cancelled; the unrelated step is untouched.
    const steps = await TaskStepService.listSteps(owner, task.slug)
    expect(steps.map(s => s.state)).toEqual(['cancelled', 'cancelled', 'held'])
    expect(steps[0]?.outcome?.notes).toMatch(/deleted/i)
    expect(steps[1]?.outcome?.notes).toMatch(/prerequisite/i)

    expect(await reservationsOf(mover._id)).toBeNull()
    expect(await reservationsOf(follower._id)).toBeNull()
    expect(await reservationsOf(bystander._id)).not.toBeNull()
    expect((await findActivation(task.taskId, activationId))?.state).toBe('active')

    // Finishing the remaining step finishes the activation.
    await TaskExecutionService.confirmStep(owner, task.slug, {
      stepId: task.steps[2]!.stepId, activationId, operationId: opId('delete-rest'), source: 'online'
    })
    expect((await findActivation(task.taskId, activationId))?.state).toBe('finished')
  })

  it('deletes a held target, cancels its step and frees the reserved destination', async () => {
    const box = await makeCountBox('HOLDTEST Freed Box', 1)
    const vial = await makeVial('HOLDTEST Deleted Target')
    const task = await makePlannedTask('HOLDTEST delete target', [moveStep(vial, box)])
    const activationId = await activateAll(task)

    const result = await ItemService.deleteItem({ itemSlug: [vial.slug] }, owner)
    expect(result.failures).toEqual([])

    expect(await stepStates(task)).toEqual(['cancelled'])
    expect(await reservationsOf(box._id)).toBeNull()
    expect((await findActivation(task.taskId, activationId))?.state).toBe('cancelled')
  })

  it('cancels a step that was only planned, without touching any activation', async () => {
    const vial = await makeVial('HOLDTEST Planned Target')
    const task = await makePlannedTask('HOLDTEST delete planned', [alterStep(vial, 'checkout')])

    await ItemService.deleteItem({ itemSlug: [vial.slug] }, owner)
    expect(await stepStates(task)).toEqual(['cancelled'])
  })

  it('cancels a step at activation when its target vanished without the delete hook', async () => {
    const vial = await makeVial('HOLDTEST Vanished Target')
    const keeper = await makeVial('HOLDTEST Vanished Keeper')
    const task = await makePlannedTask('HOLDTEST vanished', [alterStep(vial, 'checkout'), alterStep(keeper, 'checkout')])

    // Remove the document behind the services' back, as a failed invalidation would leave it.
    const doc = await couchDB.getDocument<{ _id: string, _rev: string }>(vial._id)
    await couchDB.deleteDocument(doc!._id, doc!._rev)

    await expect(activateAll(task)).rejects.toThrow(/no longer exists/i)
    expect(await stepStates(task)).toEqual(['cancelled', 'planned'])

    // The remaining step can be activated on its own.
    const activation = await TaskActivationService.activateSteps(owner, task.slug, {
      stepIds: [task.steps[1]!.stepId], operationId: opId('vanished-retry')
    })
    expect(activation.state).toBe('active')
  })
})
