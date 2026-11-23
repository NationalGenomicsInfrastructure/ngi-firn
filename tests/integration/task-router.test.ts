/*
 * Integration tests for the tasks tRPC router (server/trpc/routers/tasks): the full planning →
 * activation → confirmation path through the wire format, client-safe output, and the mapping of
 * task domain errors to tRPC codes. Runs against the isolated test CouchDB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { couchDB } from '../../server/database/couchdb'
import { UserService } from '../../server/crud/users.server'
import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import { operationDocId } from '../../server/crud/tasks/operations.server'
import { createCallerFactory } from '../../server/trpc/init'
import { tasksRouter } from '../../server/trpc/routers/tasks'
import type { Context } from '../../types/trpc'
import type { FirnUser } from '../../types/auth'
import type { Container, InventoryItem } from '../../types/inventory'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []
const createdTaskSlugs: string[] = []
const usedOpIds: string[] = []

let owner: FirnUser
let colleague: FirnUser
let stranger: FirnUser
let boxA: Container
let boxB: Container
let vial: InventoryItem

const createCaller = createCallerFactory(tasksRouter)

/* A caller authenticated as `user`, exactly as a session would provide it. */
function callerFor(user: FirnUser) {
  const ctx: Context = {
    secure: { id: user._id, allowLogin: true, isRetired: false, isAdmin: false, permissions: [] }
  }
  return createCaller(ctx)
}

function opId(): string {
  const id = crypto.randomUUID()
  usedOpIds.push(id)
  return id
}

async function makeUser(label: string): Promise<FirnUser> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const user = await UserService.createUserByAdmin({
    googleGivenName: label,
    googleFamilyName: 'RouterTester',
    googleEmail: `bctest-router-${label.toLowerCase()}-${suffix}@scilifelab.se`,
    isAdmin: false
  })
  if (!user) throw new Error(`Failed to create the ${label} user fixture.`)
  createdIds.push(user._id)
  return user
}

async function makeTask(title: string) {
  const task = await callerFor(owner).create({ title })
  createdTaskSlugs.push(task.slug)
  return task
}

/* No CouchDB document id may appear anywhere in a client-facing result. */
function expectNoDocumentIds(value: unknown, ...docIds: string[]): void {
  const json = JSON.stringify(value)
  expect(json).not.toContain('"_id"')
  expect(json).not.toContain('"_rev"')
  for (const id of docIds) expect(json).not.toContain(id)
}

beforeAll(async () => {
  const base = await setupBaseFixture()
  owner = base.user
  createdIds.push(...base.createdIds)
  colleague = await makeUser('Colleague')
  stranger = await makeUser('Stranger')

  const equip = await EquipmentService.createEquipment({
    name: 'ROUTERTEST Freezer',
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)
  for (const name of ['ROUTERTEST Box A', 'ROUTERTEST Box B']) {
    const box = await ContainerService.createContainer({
      containerType: 'Compartment', classification: 'Sample', name,
      parentSlug: equip.slug, parentKind: 'equipment',
      capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 10 }]
    }, owner)
    createdIds.push(box._id)
    if (name.endsWith('A')) boxA = box
    else boxB = box
  }
  vial = await ItemService.createItem({
    category: 'cryovial', name: 'ROUTERTEST Vial', parentSlug: boxA.slug, parentKind: 'container'
  }, owner)
  createdIds.push(vial._id)
})

afterAll(async () => {
  // Steps, activations and operation documents first, then the tasks and the inventory host.
  const taskDocs: string[] = []
  for (const slug of createdTaskSlugs) {
    const task = (await couchDB.queryView<string, null, { _id: string }>('firn-tasks', 'by_slug', { key: slug, include_docs: true })).rows[0]?.doc
    if (!task) continue
    taskDocs.push(task._id)
    const steps = (await couchDB.queryView<[string, number], null>('firn-tasks', 'steps_by_task', {
      startkey: [task._id, 0], endkey: [task._id, Number.MAX_SAFE_INTEGER]
    })).rows
    const activations = (await couchDB.queryView<[string, string], null>('firn-tasks', 'activations_by_task', {
      startkey: [task._id, ''], endkey: [task._id, '￰']
    })).rows
    for (const row of [...steps, ...activations]) if (row.id) taskDocs.push(row.id)
  }
  for (const id of usedOpIds) taskDocs.push(operationDocId(id))
  await cleanupFixture([...createdIds, ...taskDocs])
})

describe('tasks router', () => {
  it('plans, activates and confirms work through the wire format without leaking document ids', async () => {
    const api = callerFor(owner)
    const task = await makeTask('ROUTERTEST Move vial')
    expect(task.status).toBe('draft')
    expect(task.viewerRole).toBe('owner')

    const [step] = await api.steps.add({
      taskSlug: task.slug,
      steps: [{
        payload: {
          kind: 'inventory',
          action: 'move',
          target: { kind: 'item', slug: vial.slug },
          destination: { kind: 'container', slug: boxB.slug }
        }
      }]
    })
    expect(step!.payload).toMatchObject({ kind: 'inventory', action: 'move', target: { entity: { slug: vial.slug } } })

    await api.publish({ taskSlug: task.slug })
    const activation = await api.activations.activate({ taskSlug: task.slug, stepIds: [step!.stepId], operationId: opId() })
    expect(activation.state).toBe('active')

    const confirmed = await api.activations.confirmStep({
      taskSlug: task.slug,
      stepId: step!.stepId,
      activationId: activation.activationId,
      operationId: opId(),
      source: 'online'
    })
    expect(confirmed.state).toBe('completed')
    expect((await ItemService.getItemBySlug(vial.slug))?.parent?.id).toBe(boxB._id)

    const [listed] = await api.activations.list({ taskSlug: task.slug })
    expect(listed!.state).toBe('finished')

    expectNoDocumentIds([task, step, activation, confirmed, listed], vial._id, boxB._id, owner._id)
  })

  it('maps an unknown inventory slug to BAD_REQUEST', async () => {
    const task = await makeTask('ROUTERTEST Unknown slug')
    await expect(callerFor(owner).steps.add({
      taskSlug: task.slug,
      steps: [{ payload: { kind: 'inventory', action: 'checkout', target: { kind: 'item', slug: 'no-such-vial' } } }]
    })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/no-such-vial/) })
  })

  it('maps an invalid payload to BAD_REQUEST before any service runs', async () => {
    const task = await makeTask('ROUTERTEST Invalid payload')
    await expect(callerFor(owner).steps.add({
      taskSlug: task.slug,
      // Disposing of a container is not a valid step; the cast stands in for an untyped client.
      steps: [{ payload: { kind: 'inventory', action: 'dispose', target: { kind: 'container', slug: boxA.slug } } as never }]
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('hides a private task from a stranger as NOT_FOUND', async () => {
    const task = await makeTask('ROUTERTEST Private')
    await expect(callerFor(stranger).getBySlug({ taskSlug: task.slug })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callerFor(stranger).getBySlug({ taskSlug: 'no-such-task' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a viewer\'s edit as FORBIDDEN', async () => {
    const task = await makeTask('ROUTERTEST Viewer edit')
    await callerFor(owner).setSharing({ taskSlug: task.slug, viewerFirnIds: [colleague.firnId] })

    const seen = await callerFor(colleague).getBySlug({ taskSlug: task.slug })
    expect(seen.viewerRole).toBe('viewer')
    await expect(callerFor(colleague).updateMetadata({ taskSlug: task.slug, title: 'Hijacked' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('refuses an operation id reused for a different request as CONFLICT', async () => {
    const api = callerFor(owner)
    const task = await makeTask('ROUTERTEST Reused operation')
    const [first, second] = await api.steps.add({
      taskSlug: task.slug,
      steps: [{ payload: { kind: 'text', title: 'First' } }, { payload: { kind: 'text', title: 'Second' } }]
    })
    await api.publish({ taskSlug: task.slug })

    const operationId = opId()
    await api.activations.activate({ taskSlug: task.slug, stepIds: [first!.stepId], operationId })
    await expect(api.activations.activate({ taskSlug: task.slug, stepIds: [second!.stepId], operationId }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('requires an authenticated session', async () => {
    await expect(createCaller({}).list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
