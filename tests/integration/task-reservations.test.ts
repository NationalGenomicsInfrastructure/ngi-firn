/*
 * Integration tests for task reservation holds (physical holds) and their
 * enforcement at the ordinary inventory write boundaries. Runs against the
 * isolated test CouchDB (see tests/setup/integration.ts).
 *
 * Scope follows the small-user-base directive: these verify functional
 * behaviour (a hold blocks ordinary writes, is idempotent, and never mutates
 * status/placement/counters), not elaborate concurrency races.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import {
  acquireCapacityClaim,
  acquireGridCellClaim,
  acquireStructuralGuard,
  acquireTargetHold,
  allocatableCount,
  consumeTargetHold,
  findFirstFreeUnheldGridSlot,
  type HoldClaimContext,
  releaseParentClaimsForStep,
  releaseTargetHold,
  type TargetHoldContext
} from '../../server/crud/inventory/reservations.server'
import type { Container, InventoryItem, StorageEquipment } from '../../types/inventory'
import type { FirnUser } from '../../types/auth'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []
let user: FirnUser
let equip: StorageEquipment
let gridBox: Container
let tube: InventoryItem

const ACT = 'ACT-RES'
let roomSlug: string

function targetCtx(over: Partial<TargetHoldContext> = {}): TargetHoldContext {
  return { activationId: ACT, stepId: 'STEP-1', generation: 1, operationId: 'OP-1', executorFirnId: user._id, ...over }
}

function claimCtx(over: Partial<HoldClaimContext> = {}): HoldClaimContext {
  return { activationId: ACT, stepId: 'STEP-1', generation: 1, operationId: 'OP-1', ...over }
}

beforeAll(async () => {
  const base = await setupBaseFixture()
  user = base.user
  roomSlug = base.room.slug
  createdIds.push(...base.createdIds)

  equip = await EquipmentService.createEquipment({
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    name: 'RESTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 10 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)

  gridBox = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name: 'RESTEST Item Grid',
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'grid', childKind: 'item', type: 'cryovial', rows: 2, columns: 2, levels: 1 }]
  }, user)
  createdIds.push(gridBox._id)

  tube = await ItemService.createItem({
    category: 'cryovial', name: 'RESTEST Tube', classification: 'Sample',
    parentSlug: gridBox.slug, parentKind: 'container',
    position: { row: 1, column: 1, level: 1 }
  } as Parameters<typeof ItemService.createItem>[0], user)
  createdIds.push(tube._id)
})

afterAll(async () => {
  await cleanupFixture(createdIds)
})

describe('target holds', () => {
  it('block ordinary checkout, move, update and delete while held, and are inert once released', async () => {
    await acquireTargetHold(tube._id, targetCtx())

    await expect(ItemService.alterItem({
      itemSlug: [tube.slug], performedAction: 'checkout'
    } as Parameters<typeof ItemService.alterItem>[0], user)).rejects.toThrow(/reserved/i)

    await expect(ItemService.moveItem({
      itemSlug: [tube.slug], newParentSlug: gridBox.slug, newParentKind: 'container',
      position: { row: 2, column: 2, level: 1 }
    }, user)).rejects.toThrow(/reserved/i)

    await expect(ItemService.updateItem({
      itemSlug: tube.slug, name: 'RESTEST Tube renamed'
    } as Parameters<typeof ItemService.updateItem>[0], user)).rejects.toThrow(/reserved/i)

    const delResult = await ItemService.deleteItem({ itemSlug: [tube.slug] } as Parameters<typeof ItemService.deleteItem>[0])
    expect(delResult.deleted).toHaveLength(0)
    expect(delResult.failures[0]?.error).toMatch(/reserved/i)

    // Releasing the hold restores ordinary writability.
    await releaseTargetHold(tube._id, claimCtx())
    const updated = await ItemService.updateItem({
      itemSlug: tube.slug, name: 'RESTEST Tube ok'
    } as Parameters<typeof ItemService.updateItem>[0], user)
    expect(updated.name).toBe('RESTEST Tube ok')
    tube = (await ItemService.getItemBySlug(updated.slug))!
  })

  it('never change status, placement or parent stored counters', async () => {
    const before = await ItemService.getItemBySlug(tube.slug)
    const boxBefore = await ContainerService.getContainerBySlug(gridBox.slug)
    const storedBefore = boxBefore?.capacity?.find(e => e.layout === 'grid')?.stored

    await acquireTargetHold(tube._id, targetCtx())
    await consumeTargetHold(tube._id, claimCtx())

    const held = await ItemService.getItemBySlug(tube.slug)
    expect(held?.status).toBe(before?.status)
    expect(held?.parent?.id).toBe(before?.parent?.id)
    expect(held?.position).toEqual(before?.position)
    const boxHeld = await ContainerService.getContainerBySlug(gridBox.slug)
    expect(boxHeld?.capacity?.find(e => e.layout === 'grid')?.stored).toBe(storedBefore)

    await releaseTargetHold(tube._id, claimCtx())
  })

  it('treat consume and release as idempotent', async () => {
    await acquireTargetHold(tube._id, targetCtx())
    await consumeTargetHold(tube._id, claimCtx())
    await expect(consumeTargetHold(tube._id, claimCtx())).resolves.toBeDefined()
    await releaseTargetHold(tube._id, claimCtx())
    await expect(releaseTargetHold(tube._id, claimCtx())).resolves.toBeDefined()
  })

  it('refuse acquisition or release by a different activation', async () => {
    await acquireTargetHold(tube._id, targetCtx())
    await expect(acquireTargetHold(tube._id, targetCtx({ activationId: 'ACT-OTHER' }))).rejects.toThrow(/reserved/i)
    await expect(releaseTargetHold(tube._id, claimCtx({ activationId: 'ACT-OTHER' }))).rejects.toThrow(/reserved/i)
    await releaseTargetHold(tube._id, claimCtx())
  })
})

describe('grid cell claims', () => {
  it('reserve an exact cell so ordinary placement cannot take it', async () => {
    await acquireGridCellClaim(gridBox._id, { row: 2, column: 2, level: 1 }, claimCtx({ stepId: 'STEP-GRID' }))

    // Ordinary create onto the held cell is refused.
    await expect(ItemService.createItem({
      category: 'cryovial', name: 'RESTEST Intruder', classification: 'Sample',
      parentSlug: gridBox.slug, parentKind: 'container',
      position: { row: 2, column: 2, level: 1 }
    } as Parameters<typeof ItemService.createItem>[0], user)).rejects.toThrow(/reserved/i)

    // A different, unheld free cell still accepts an ordinary placement.
    const sibling = await ItemService.createItem({
      category: 'cryovial', name: 'RESTEST Sibling', classification: 'Sample',
      parentSlug: gridBox.slug, parentKind: 'container',
      position: { row: 1, column: 2, level: 1 }
    } as Parameters<typeof ItemService.createItem>[0], user)
    createdIds.push(sibling._id)

    // Releasing the claim frees the cell for ordinary use.
    await releaseParentClaimsForStep(gridBox._id, { activationId: ACT, stepId: 'STEP-GRID' })
    const latecomer = await ItemService.createItem({
      category: 'cryovial', name: 'RESTEST Latecomer', classification: 'Sample',
      parentSlug: gridBox.slug, parentKind: 'container',
      position: { row: 2, column: 2, level: 1 }
    } as Parameters<typeof ItemService.createItem>[0], user)
    createdIds.push(latecomer._id)
    expect(latecomer.position).toMatchObject({ row: 2, column: 2 })
  })

  it('skip held cells in the hold-aware allocator', async () => {
    const strip = await ContainerService.createContainer({
      containerType: 'Compartment', classification: 'Sample', name: 'RESTEST Strip',
      parentSlug: equip.slug, parentKind: 'equipment',
      capacity: [{ layout: 'grid', childKind: 'item', type: 'cryovial', rows: 1, columns: 2, levels: 1 }]
    }, user)
    createdIds.push(strip._id)

    await acquireGridCellClaim(strip._id, { row: 1, column: 1, level: 1 }, claimCtx({ stepId: 'STEP-ALLOC' }))
    const fresh = (await ContainerService.getContainerBySlug(strip.slug))!
    const gridEntry = fresh.capacity!.find(e => e.layout === 'grid') as Extract<NonNullable<Container['capacity']>[number], { layout: 'grid' }>

    const slot = await findFirstFreeUnheldGridSlot(fresh, gridEntry)
    expect(slot).toMatchObject({ row: 1, column: 2 })

    // When the claiming activation itself allocates, its own cell is available.
    const ownSlot = await findFirstFreeUnheldGridSlot(fresh, gridEntry, ACT)
    expect(ownSlot).toMatchObject({ row: 1, column: 1 })
  })
})

describe('capacity claims', () => {
  it('reserve count capacity so ordinary placement cannot exceed physical plus held', async () => {
    const smallEquip = await EquipmentService.createEquipment({
      parentSlug: roomSlug,
      equipmentType: 'Freezer',
      name: 'RESTEST Small Freezer',
      capacity: [{ type: 'Compartment', capacity: 1 }],
      itemCapacity: [{ category: 'cryovial', capacity: 2 }],
      temperatureCategory: 'deep_freezer'
    } as Parameters<typeof EquipmentService.createEquipment>[0])
    createdIds.push(smallEquip._id)

    const first = await ItemService.createItem({
      category: 'cryovial', name: 'RESTEST Direct 1', classification: 'Sample',
      parentSlug: smallEquip.slug, parentKind: 'equipment'
    } as Parameters<typeof ItemService.createItem>[0], user)
    createdIds.push(first._id)

    // Reserve the one remaining unit of a capacity-2 category (physical 1 + held 1 = 2).
    await acquireCapacityClaim(smallEquip._id, 'cryovial', 'item', 1, claimCtx({ stepId: 'STEP-CAP' }))

    await expect(ItemService.createItem({
      category: 'cryovial', name: 'RESTEST Direct 2', classification: 'Sample',
      parentSlug: smallEquip.slug, parentKind: 'equipment'
    } as Parameters<typeof ItemService.createItem>[0], user)).rejects.toThrow(/reserved/i)

    // allocatableCount reflects the held unit, but excludes the claiming activation on request.
    const fresh = (await EquipmentService.getEquipmentBySlug(smallEquip.slug))!
    expect(allocatableCount(fresh, 'cryovial', 'item')).toBe(0)
    expect(allocatableCount(fresh, 'cryovial', 'item', ACT)).toBe(1)

    await releaseParentClaimsForStep(smallEquip._id, { activationId: ACT, stepId: 'STEP-CAP' })
    const second = await ItemService.createItem({
      category: 'cryovial', name: 'RESTEST Direct 2', classification: 'Sample',
      parentSlug: smallEquip.slug, parentKind: 'equipment'
    } as Parameters<typeof ItemService.createItem>[0], user)
    createdIds.push(second._id)
    expect(second.parent?.id).toBe(smallEquip._id)
  })
})

describe('structural guards', () => {
  it('block incompatible equipment edits until released', async () => {
    const guarded = await EquipmentService.createEquipment({
      equipmentType: 'Freezer',
      name: 'RESTEST Guarded Freezer',
      capacity: [{ type: 'Compartment', capacity: 2 }],
      itemCapacity: [{ category: 'cryovial', capacity: 5 }],
      temperatureCategory: 'deep_freezer',
      parentSlug: roomSlug
    } as Parameters<typeof EquipmentService.createEquipment>[0])
    createdIds.push(guarded._id)

    await acquireStructuralGuard(guarded._id, 'subtree', claimCtx({ stepId: 'STEP-GUARD' }))

    await expect(EquipmentService.updateEquipment({
      equipmentSlug: guarded.slug, capacity: [{ type: 'Compartment', capacity: 3 }]
    } as Parameters<typeof EquipmentService.updateEquipment>[0])).rejects.toThrow(/reserved/i)

    await releaseParentClaimsForStep(guarded._id, { activationId: ACT, stepId: 'STEP-GUARD' })
    const updated = await EquipmentService.updateEquipment({
      equipmentSlug: guarded.slug, capacity: [{ type: 'Compartment', capacity: 3 }]
    } as Parameters<typeof EquipmentService.updateEquipment>[0])
    expect(updated.capacity?.find(e => e.type === 'Compartment')?.capacity).toBe(3)
  })

  it('block incompatible container edits until released', async () => {
    const guardedBox = await ContainerService.createContainer({
      containerType: 'Compartment', classification: 'Sample', name: 'RESTEST Guarded Box',
      parentSlug: equip.slug, parentKind: 'equipment',
      capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 5 }]
    }, user)
    createdIds.push(guardedBox._id)

    await acquireStructuralGuard(guardedBox._id, 'subtree', claimCtx({ stepId: 'STEP-GUARD-C' }))

    await expect(ContainerService.updateContainer({
      containerSlug: guardedBox.slug, name: 'RESTEST Guarded Box renamed'
    } as Parameters<typeof ContainerService.updateContainer>[0], user)).rejects.toThrow(/reserved/i)

    await releaseParentClaimsForStep(guardedBox._id, { activationId: ACT, stepId: 'STEP-GUARD-C' })
    const updated = await ContainerService.updateContainer({
      containerSlug: guardedBox.slug, name: 'RESTEST Guarded Box renamed'
    } as Parameters<typeof ContainerService.updateContainer>[0], user)
    expect(updated.name).toBe('RESTEST Guarded Box renamed')
  })
})
