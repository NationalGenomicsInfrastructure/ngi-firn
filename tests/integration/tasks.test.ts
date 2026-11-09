/*
 * Integration test for the task storage layer (Phase 2: task aggregate, steps,
 * access control, sharing, pool/claim and listings).
 *
 * The services only behave correctly against real stored documents and real
 * CouchDB view indexes (slug/owner/responsible/viewer/pool lookups, per-document
 * _rev CAS on claim), so this exercises `TaskService`/`TaskStepService` against a
 * live CouchDB in the isolated test database. The suite is self-contained: it
 * creates its own throwaway users plus a small inventory fixture (prefixed
 * `BCTEST`) and deletes everything it created in afterAll.
 *
 * Cases share one fixture and mutate it in order, so they run sequentially (see
 * vitest.config.ts). The one place concurrency matters — two racing claims — uses
 * real concurrent promises inside a single test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { UserService } from '../../server/crud/users.server'
import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import { TaskService } from '../../server/crud/tasks/tasks.server'
import { TaskStepService } from '../../server/crud/tasks/steps.server'
import { TaskAccessError, TaskConflictError, TaskForbiddenError, TaskValidationError } from '../../server/crud/tasks/common'
import type { TaskStepPayload } from '../../types/productivity'
import type { FirnUser } from '../../types/auth'
import type { Container, InventoryItem } from '../../types/inventory'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []

let owner: FirnUser
let colleagueA: FirnUser
let colleagueB: FirnUser
let stranger: FirnUser
let box: Container
let vial: InventoryItem

/* Create an approved, active user and track it for cleanup. */
async function makeUser(label: string): Promise<FirnUser> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const user = await UserService.createUserByAdmin({
    googleGivenName: label,
    googleFamilyName: 'TaskTester',
    googleEmail: `bctest-task-${label.toLowerCase()}-${suffix}@scilifelab.se`,
    isAdmin: false
  })
  if (!user) throw new Error(`Failed to create the ${label} user fixture.`)
  createdIds.push(user._id)
  return user
}

/* Create a task owned by `actor`, tracking it (and its steps) for cleanup. */
async function makeTask(actor: FirnUser, input: Parameters<typeof TaskService.createTask>[1]) {
  const task = await TaskService.createTask(actor, input)
  createdIds.push(task._id)
  return task
}

/* Add steps to a task, tracking the created step documents for cleanup. */
async function addSteps(actor: FirnUser, slug: string, definitions: Parameters<typeof TaskStepService.addSteps>[2]) {
  const steps = await TaskStepService.addSteps(actor, slug, definitions)
  for (const step of steps) createdIds.push(step._id)
  return steps
}

function textStep(title: string): TaskStepPayload {
  return { kind: 'text', title, body: null, contextRefs: null }
}

function checkoutStep(target: InventoryItem): TaskStepPayload {
  return {
    kind: 'inventory',
    action: 'checkout',
    targetKind: 'item',
    target: {
      ref: { db: 'firn', id: target._id, type: 'inventoryItem' },
      slug: target.slug,
      name: target.name,
      pathLabel: 'BCTEST Freezer › BCTEST Box'
    },
    expectedStatus: null,
    notes: null
  }
}

beforeAll(async () => {
  const base = await setupBaseFixture()
  owner = base.user
  createdIds.push(...base.createdIds)

  colleagueA = await makeUser('Alpha')
  colleagueB = await makeUser('Beta')
  stranger = await makeUser('Gamma')

  // Minimal inventory target so planning can reference a real item.
  const equip = await EquipmentService.createEquipment({
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    name: 'BCTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)

  box = await ContainerService.createContainer({
    containerType: 'Compartment',
    classification: 'Sample',
    name: 'BCTEST Box',
    parentSlug: equip.slug,
    parentKind: 'equipment',
    capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 20 }]
  }, owner)
  createdIds.push(box._id)

  vial = await ItemService.createItem({
    category: 'cryovial', name: 'BCTEST Vial', parentSlug: box.slug, parentKind: 'container'
  }, owner)
  createdIds.push(vial._id)
})

afterAll(async () => {
  await cleanupFixture(createdIds)
})

describe('Task definition and steps', () => {
  it('creates a private draft task and bundles ordered mixed steps', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Mixed task' })
    expect(task.status).toBe('draft')
    expect(task.visibility).toBe('private')

    const steps = await addSteps(owner, task.slug, [
      { payload: textStep('Prepare bench') },
      { payload: checkoutStep(vial) }
    ])
    expect(steps.map(s => s.order)).toEqual([0, 1])

    const display = await TaskStepService.listSteps(owner, task.slug)
    expect(display.map(s => s.order)).toEqual([0, 1])
    expect(display.map(s => s.payload.kind)).toEqual(['text', 'inventory'])
  })

  it('supports a single-step task', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Single step' })
    const steps = await addSteps(owner, task.slug, [{ payload: textStep('Only step') }])
    expect(steps).toHaveLength(1)
    expect(steps[0]!.order).toBe(0)
  })

  it('records planning intent without mutating the referenced inventory', async () => {
    const before = await ItemService.getItemBySlug(vial.slug)
    const task = await makeTask(owner, { title: 'BCTEST Non-mutating plan' })
    await addSteps(owner, task.slug, [{ payload: checkoutStep(vial) }])
    const after = await ItemService.getItemBySlug(vial.slug)
    // Planning writes a step document only; the inventory object is untouched.
    expect(after?._rev).toBe(before?._rev)
    expect(after?.status).toBe(before?.status)
  })
})

describe('Step dependency validation', () => {
  it('rejects self, unknown and cyclic dependencies but accepts a valid edge', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Dependencies' })
    const [a, b] = await addSteps(owner, task.slug, [
      { payload: textStep('Step A') },
      { payload: textStep('Step B') }
    ])

    await expect(TaskStepService.setDependencies(owner, task.slug, a!.stepId, [a!.stepId]))
      .rejects.toBeInstanceOf(TaskValidationError)
    await expect(TaskStepService.setDependencies(owner, task.slug, a!.stepId, ['stp_does_not_exist']))
      .rejects.toBeInstanceOf(TaskValidationError)

    // B depends on A is fine.
    const updatedB = await TaskStepService.setDependencies(owner, task.slug, b!.stepId, [a!.stepId])
    expect(updatedB.dependsOn).toEqual([a!.stepId])

    // A depending back on B would close a cycle.
    await expect(TaskStepService.setDependencies(owner, task.slug, a!.stepId, [b!.stepId]))
      .rejects.toBeInstanceOf(TaskValidationError)
  })
})

describe('Access control and sharing', () => {
  it('hides a private task from strangers and honours shared roles', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Shared task' })

    await expect(TaskService.requireReadableTask(stranger, task.slug))
      .rejects.toBeInstanceOf(TaskAccessError)

    await TaskService.setSharing(owner, task.slug, {
      responsibleFirnIds: [colleagueA.firnId],
      viewerFirnIds: [colleagueB.firnId]
    })

    // Responsible and viewer can read.
    expect((await TaskService.getDisplayTask(colleagueA, task.slug)).viewerRole).toBe('responsible')
    expect((await TaskService.getDisplayTask(colleagueB, task.slug)).viewerRole).toBe('viewer')
    // Still private: an unshared stranger cannot read.
    await expect(TaskService.requireReadableTask(stranger, task.slug))
      .rejects.toBeInstanceOf(TaskAccessError)
  })

  it('lets only the owner perform structural edits', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Manage task' })
    await TaskService.setSharing(owner, task.slug, { viewerFirnIds: [colleagueB.firnId] })

    await expect(addSteps(colleagueB, task.slug, [{ payload: textStep('Sneaky') }]))
      .rejects.toBeInstanceOf(TaskForbiddenError)

    const steps = await addSteps(owner, task.slug, [{ payload: textStep('Legit') }])
    expect(steps).toHaveLength(1)
  })

  it('transfers ownership so the new owner manages and the old owner cannot', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Transfer task' })
    await TaskService.transferOwnership(owner, task.slug, colleagueA.firnId)

    const moved = await TaskService.getDisplayTask(colleagueA, task.slug)
    expect(moved.viewerRole).toBe('owner')

    await expect(TaskService.setSharing(owner, task.slug, { viewerFirnIds: [] }))
      .rejects.toBeInstanceOf(TaskAccessError)
    // New owner can still manage.
    const reshared = await TaskService.setSharing(colleagueA, task.slug, { viewerFirnIds: [colleagueB.firnId] })
    expect(reshared.viewers).toHaveLength(1)
  })
})

describe('Pool and claiming', () => {
  it('publishes a public task into the pool and claims it atomically under concurrency', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Pool task', visibility: 'public' })
    await TaskService.publishTask(owner, task.slug)

    const pool = await TaskService.listPool(stranger)
    expect(pool.tasks.some(t => t.slug === task.slug)).toBe(true)

    // Two colleagues race to claim; exactly one wins, the other gets a conflict.
    const results = await Promise.allSettled([
      TaskService.claimTask(colleagueA, task.slug),
      TaskService.claimTask(colleagueB, task.slug)
    ])
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(TaskConflictError)

    // Once claimed it leaves the pool.
    const poolAfter = await TaskService.listPool(stranger)
    expect(poolAfter.tasks.some(t => t.slug === task.slug)).toBe(false)
  })

  it('refuses to claim a private task', async () => {
    const task = await makeTask(owner, { title: 'BCTEST Private unclaimable' })
    await TaskService.publishTask(owner, task.slug)
    await expect(TaskService.claimTask(colleagueA, task.slug))
      .rejects.toBeInstanceOf(TaskForbiddenError)
  })
})

describe('Listings', () => {
  it('excludes archived tasks by default and paginates stably', async () => {
    const t1 = await makeTask(owner, { title: 'BCTEST Listing one' })
    const t2 = await makeTask(owner, { title: 'BCTEST Listing two' })
    await TaskService.archiveTask(owner, t2.slug)

    const visible = await TaskService.listForUser(owner)
    const slugs = visible.tasks.map(t => t.slug)
    expect(slugs).toContain(t1.slug)
    expect(slugs).not.toContain(t2.slug)

    const withArchived = await TaskService.listForUser(owner, { includeArchived: true })
    expect(withArchived.tasks.map(t => t.slug)).toContain(t2.slug)

    // Stable pagination: first page + second page reconstruct the full ordering.
    const page1 = await TaskService.listForUser(owner, { includeArchived: true, limit: 2, offset: 0 })
    const page2 = await TaskService.listForUser(owner, { includeArchived: true, limit: 2, offset: 2 })
    expect(page1.total).toBe(page2.total)
    const combined = [...page1.tasks, ...page2.tasks].map(t => t.slug)
    expect(new Set(combined).size).toBe(combined.length)
  })
})
