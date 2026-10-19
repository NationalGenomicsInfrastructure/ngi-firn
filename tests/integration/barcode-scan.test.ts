/*
 * Integration test for the inventory barcode scan resolver.
 *
 * This exercises `BarcodeScanService.resolveScan`/`applyScan` against a real
 * CouchDB, because the resolver's interesting behaviour — ancestry walking, role
 * classification and the status/action matrix — only emerges from real stored
 * documents. The suite is self-contained: it creates its own throwaway fixture
 * (prefixed `BCTEST`) in an isolated test database and deletes it again, so it
 * never touches existing inventory.
 *
 * The cases share one expensive fixture and mutate it in order, so they run
 * sequentially (see vitest.config.ts). Run with: pnpm test:barcode
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import { BarcodeScanService } from '../../server/crud/inventory/barcode-scan.server'
import { BARCODE_FOR_ACTION, parseBarcode } from '../../schemas/inventory/barcode'
import { formatChangeValue } from '../../app/utils/inventory/actionLog'
import type { BarcodeScanPlan, Container, InventoryItem, StorageEquipment } from '../../types/inventory'
import type { FirnUser } from '../../types/auth'
import { cleanupFixture, setupBaseFixture } from './fixtures'

/* Compact, order-independent summary of a plan, so assertions stay readable. */
function summarize(plan: BarcodeScanPlan) {
  return {
    action: plan.action,
    context: plan.context?.name ?? null,
    contextKind: plan.context?.kind ?? null,
    error: plan.error,
    targets: plan.targets
      .map(t => `${t.name}:${t.proposedAction ?? 'none'}:${t.executable ? 'exec' : 'blocked'}`)
      .sort(),
    rejected: plan.rejected.map(r => `${r.code}:${r.reason}`).sort(),
    warnings: plan.warnings.map(w => w.kind).sort()
  }
}

/* Shorthand for a document's (non-null) barcode. */
const bc = (x: { barcode: string | null }) => x.barcode!

// Shared fixture, populated once in beforeAll and mutated in order by the cases.
const createdIds: string[] = []
let user: FirnUser
let roomSlug: string
let equip: StorageEquipment
let boxA: Container
let boxB: Container
let v1: InventoryItem
let v2: InventoryItem

beforeAll(async () => {
  const base = await setupBaseFixture()
  user = base.user
  roomSlug = base.room.slug
  // Share the same id list so cleanup removes the base user/room too.
  createdIds.push(...base.createdIds)

  // ---- Fixture: one freezer, two boxes inside it, two vials inside box A ----
  equip = await EquipmentService.createEquipment({
    parentSlug: roomSlug,
    equipmentType: 'Freezer',
    name: 'BCTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)

  const makeBox = async (name: string) => {
    const box = await ContainerService.createContainer({
      containerType: 'Compartment',
      classification: 'Sample',
      name,
      parentSlug: equip.slug,
      parentKind: 'equipment',
      capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 20 }]
    }, user)
    createdIds.push(box._id)
    return box
  }

  boxA = await makeBox('BCTEST Box A')
  boxB = await makeBox('BCTEST Box B')

  const vials: InventoryItem[] = []
  for (const name of ['BCTEST Vial 1', 'BCTEST Vial 2']) {
    const vial = await ItemService.createItem({
      category: 'cryovial', name, parentSlug: boxA.slug, parentKind: 'container'
    }, user)
    createdIds.push(vial._id)
    vials.push(vial)
  }
  v1 = vials[0]!
  v2 = vials[1]!
})

afterAll(async () => {
  await cleanupFixture(createdIds)
})

describe('Barcode assignment', () => {
  it('auto-assigns a valid barcode to each entity kind', () => {
    for (const [, doc, kind] of [
      ['equipment', () => equip, 'equipment'],
      ['container', () => boxA, 'container'],
      ['item', () => v1, 'item']
    ] as const) {
      const parsed = parseBarcode(bc(doc()))
      expect(
        parsed.kind === 'entity' && parsed.entityKind === kind,
        `got ${bc(doc())} -> ${JSON.stringify(parsed)}`
      ).toBe(true)
    }
  })

  it('assigns a distinct barcode to every fixture entity', () => {
    expect(new Set([equip, boxA, boxB, v1, v2].map(bc)).size).toBe(5)
  })
})

describe('Barcode prefix must match the entity it is assigned to', () => {
  // Asserting on the message matters here: an earlier draft of this test passed a
  // wrong field name, so every call failed with "not found" and the checks went
  // green without ever reaching the guard they were meant to exercise.
  const refusalReason = async (barcode: string): Promise<string> => {
    try {
      await ItemService.updateItem({ itemSlug: v1.slug, barcode }, user)
      return ''
    }
    catch (error) { return error instanceof Error ? error.message : String(error) }
  }

  it('refuses a container-prefixed barcode on an item', async () => {
    const wrongKind = await refusalReason(bc(boxB))
    expect(
      wrongKind.includes('container code') && wrongKind.includes('cannot be assigned to a item'),
      wrongKind
    ).toBe(true)
  })

  it('refuses a reserved action barcode on an entity', async () => {
    const actionCard = await refusalReason(BARCODE_FOR_ACTION.dispose)
    expect(actionCard.includes('reserved action card'), actionCard).toBe(true)
  })

  it('refuses a barcode already held by another entity', async () => {
    const duplicate = await refusalReason(bc(v2))
    expect(duplicate.includes('already assigned'), duplicate).toBe(true)
  })

  it('accepts a non-Firn external label and can restore the original', async () => {
    const external = await ItemService.updateItem({ itemSlug: v1.slug, barcode: 'VENDOR-12345' }, user)
    expect(external.barcode, String(external.barcode)).toBe('vendor-12345')
    const restored = await ItemService.updateItem({ itemSlug: v1.slug, barcode: bc(v1) }, user)
    expect(restored.barcode, String(restored.barcode)).toBe(bc(v1))
  })
})

describe('Nested containers: the deepest enclosing location wins', () => {
  it('resolves the deepest enclosing container regardless of scan order', async () => {
    const rack = await ContainerService.createContainer({
      containerType: 'Compartment',
      classification: 'Sample',
      name: 'BCTEST Rack',
      parentSlug: equip.slug,
      parentKind: 'equipment',
      capacity: [{ layout: 'count', childKind: 'container', type: 'Box', capacity: 5 }]
    }, user)
    createdIds.push(rack._id)

    const inner = await ContainerService.createContainer({
      containerType: 'Box',
      classification: 'Sample',
      name: 'BCTEST Inner Box',
      parentSlug: rack.slug,
      parentKind: 'container',
      capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 10 }]
    }, user)
    createdIds.push(inner._id)

    const nested = await ItemService.createItem({
      category: 'cryovial', name: 'BCTEST Nested Vial', parentSlug: inner.slug, parentKind: 'container'
    }, user)
    createdIds.push(nested._id)

    // Both containers enclose the vial, but only the inner box is its actual parent.
    // Scanning the outer rack first must not let scan order pick the wrong location.
    const outerFirst = summarize(
      await BarcodeScanService.resolveScan([bc(rack), bc(inner), bc(nested)], user)
    )
    expect(outerFirst.context, JSON.stringify(outerFirst)).toBe('BCTEST Inner Box')
    expect(
      !outerFirst.warnings.includes('parent_mismatch'),
      JSON.stringify(outerFirst.warnings)
    ).toBe(true)

    const innerFirst = summarize(
      await BarcodeScanService.resolveScan([bc(inner), bc(rack), bc(nested)], user)
    )
    expect(innerFirst.context, JSON.stringify(innerFirst)).toBe(outerFirst.context)
    expect(outerFirst.targets.join('|'), JSON.stringify(outerFirst)).toBe('BCTEST Nested Vial:checkout:exec')
  })
})

describe('Default checkout/return toggle', () => {
  it('turns the enclosing container into context and items into targets', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(v2), bc(boxA)], user))
    expect(
      p.contextKind === 'container' && p.context === 'BCTEST Box A'
      && p.targets.join('|') === 'BCTEST Vial 1:checkout:exec|BCTEST Vial 2:checkout:exec',
      JSON.stringify(p)
    ).toBe(true)
    expect(p.warnings.length, JSON.stringify(p.warnings)).toBe(0)
  })

  it('prefers an enclosing container over the equipment and reports the ignored location', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(boxA), bc(equip)], user))
    expect(
      p.context === 'BCTEST Box A' && p.warnings.includes('context_ignored'),
      JSON.stringify(p)
    ).toBe(true)
    const plan = await BarcodeScanService.resolveScan([bc(v1), bc(boxA), bc(equip)], user)
    expect(plan.contextCode, String(plan.contextCode)).toBe(bc(boxA))
    expect(plan.ignoredLocationCodes.join('|'), JSON.stringify(plan.ignoredLocationCodes)).toBe(bc(equip))
  })

  it('warns about a parent mismatch when only grandparent equipment is given as context', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(equip)], user))
    expect(
      p.context === 'BCTEST Freezer' && p.warnings.includes('parent_mismatch'),
      JSON.stringify(p)
    ).toBe(true)
  })

  it('treats a container scanned alone as a target, not context', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(boxA)], user))
    expect(
      p.context === null && p.targets.join('|') === 'BCTEST Box A:checkout:exec',
      JSON.stringify(p)
    ).toBe(true)
  })

  it('treats a container that encloses nothing scanned as a target', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(boxB)], user))
    expect(p.context === null && p.targets.length === 2, JSON.stringify(p)).toBe(true)
  })

  it('errors when only a location is scanned', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(equip)], user))
    expect(p.error !== null && p.targets.length === 0, JSON.stringify(p)).toBe(true)
  })
})

describe('Relocating actions', () => {
  it('treats the last scanned location as the move destination', async () => {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), bc(v2), BARCODE_FOR_ACTION.move, bc(boxB)], user))
    expect(
      p.action === 'move' && p.context === 'BCTEST Box B'
      && p.targets.every(t => t.endsWith(':move:exec')) && p.targets.length === 2,
      JSON.stringify(p)
    ).toBe(true)
    const plan = await BarcodeScanService.resolveScan(
      [bc(v1), bc(equip), BARCODE_FOR_ACTION.move, bc(boxB)], user)
    expect(plan.contextCode, String(plan.contextCode)).toBe(bc(boxB))
    expect(plan.ignoredLocationCodes.join('|'), JSON.stringify(plan.ignoredLocationCodes)).toBe(bc(equip))
  })

  it('rejects a move without a destination', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), BARCODE_FOR_ACTION.move], user))
    expect(p.error !== null, JSON.stringify(p)).toBe(true)
  })

  it('blocks locate on an entity that is not lost', async () => {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), BARCODE_FOR_ACTION.locate, bc(boxB)], user))
    expect(p.targets.join('|'), JSON.stringify(p)).toBe('BCTEST Vial 1:locate:blocked')
  })
})

describe('Action cards and the status matrix', () => {
  it('applies a dispose action card to every target', async () => {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), bc(v2), BARCODE_FOR_ACTION.dispose], user))
    expect(
      p.action === 'dispose' && p.targets.every(t => t.endsWith(':dispose:exec')),
      JSON.stringify(p)
    ).toBe(true)
  })

  it('blocks, rather than errors, when the status forbids the action', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), BARCODE_FOR_ACTION.unreserve], user))
    expect(
      p.error === null && p.targets.join('|') === 'BCTEST Vial 1:unreserve:blocked',
      JSON.stringify(p)
    ).toBe(true)
  })

  it('aborts the scan on two conflicting action cards', async () => {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), BARCODE_FOR_ACTION.dispose, BARCODE_FOR_ACTION.reserve], user))
    expect(p.error !== null, JSON.stringify(p)).toBe(true)
  })

  it('tolerates the same action card scanned twice', async () => {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), BARCODE_FOR_ACTION.dispose, BARCODE_FOR_ACTION.dispose], user))
    expect(
      p.error === null && p.action === 'dispose' && p.warnings.includes('duplicate_scan'),
      JSON.stringify(p)
    ).toBe(true)
  })
})

describe('Malformed and unknown input', () => {
  it('reports bad codes without aborting the usable part of the scan', async () => {
    const p = summarize(await BarcodeScanService.resolveScan(
      ['hello', 'fi00000000x', 'ftabcdefghi', bc(v1), bc(v1)], user))
    expect(
      p.targets.join('|') === 'BCTEST Vial 1:checkout:exec' && p.rejected.length === 3,
      JSON.stringify(p)
    ).toBe(true)
    expect(
      p.rejected.some(r => r.startsWith('ftabcdefghi:')),
      JSON.stringify(p.rejected)
    ).toBe(true)
    expect(p.warnings.includes('duplicate_scan'), JSON.stringify(p.warnings)).toBe(true)
  })

  it('errors on an empty scan', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([], user))
    expect(p.error !== null, JSON.stringify(p)).toBe(true)
  })

  it('resolves an uppercase scan', async () => {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1).toUpperCase()], user))
    expect(p.targets.join('|'), JSON.stringify(p)).toBe('BCTEST Vial 1:checkout:exec')
  })
})

describe('Applying a scan (checkout / return round trip)', () => {
  it('checks out both vials, toggles to return, and returns them', async () => {
    const set = [bc(v1), bc(v2), bc(boxA)]

    const out1 = await BarcodeScanService.applyScan(set, user)
    expect(
      out1.failures.length === 0 && out1.applied.length === 1
      && out1.applied[0]!.action === 'checkout' && out1.applied[0]!.slugs.length === 2,
      JSON.stringify({ applied: out1.applied, failures: out1.failures })
    ).toBe(true)

    const afterCheckout = await ItemService.getItemBySlug(v1.slug)
    expect(afterCheckout?.status, `status=${afterCheckout?.status}`).toBe('in_use')
    expect(afterCheckout?.parent?.id, JSON.stringify(afterCheckout?.parent)).toBe(boxA._id)

    // Re-scanning the very same set must now mean the opposite, with no action card.
    const replan = summarize(await BarcodeScanService.resolveScan(set, user))
    expect(replan.targets.every(t => t.includes(':return:')), JSON.stringify(replan)).toBe(true)

    const out2 = await BarcodeScanService.applyScan(set, user)
    expect(
      out2.failures.length === 0 && out2.applied[0]?.action === 'return',
      JSON.stringify({ applied: out2.applied, failures: out2.failures })
    ).toBe(true)

    const afterReturn = await ItemService.getItemBySlug(v1.slug)
    expect(afterReturn?.status, `status=${afterReturn?.status}`).toBe('available')
  })
})

describe('Reservation ownership on checkout', () => {
  it('lets the owner check out their reservation but blocks another user', async () => {
    // A second identity that never reserved anything. Its _id is what the ownership
    // guard compares against, so a synthetic id is enough to stand in for another user
    // without creating a real account.
    const imposter: FirnUser = { ...user, _id: 'BCTEST-imposter-user' }

    await ItemService.alterItem({ itemSlug: [v1.slug], performedAction: 'reserve' }, user)
    const reserved = await ItemService.getItemBySlug(v1.slug)
    expect(reserved?.status, `status=${reserved?.status}`).toBe('reserved')

    const ownerPlan = summarize(await BarcodeScanService.resolveScan([bc(v1)], user))
    expect(ownerPlan.targets.join('|'), JSON.stringify(ownerPlan)).toBe('BCTEST Vial 1:checkout:exec')

    const otherPlan = summarize(await BarcodeScanService.resolveScan([bc(v1)], imposter))
    expect(
      otherPlan.error === null
      && otherPlan.targets.join('|') === 'BCTEST Vial 1:checkout:blocked',
      JSON.stringify(otherPlan)
    ).toBe(true)

    let guarded = false
    try {
      await ItemService.alterItem({ itemSlug: [v1.slug], performedAction: 'checkout' }, imposter)
    }
    catch {
      guarded = true
    }
    expect(guarded, 'alterItem did not throw for a non-owner checkout').toBe(true)

    // The owner takes it out and returns it, leaving the vial available for later tests.
    await BarcodeScanService.applyScan([bc(v1)], user)
    const owned = await ItemService.getItemBySlug(v1.slug)
    expect(owned?.status, `status=${owned?.status}`).toBe('in_use')
    await BarcodeScanService.applyScan([bc(v1)], user)
    const restored = await ItemService.getItemBySlug(v1.slug)
    expect(restored?.status, `status=${restored?.status}`).toBe('available')
  })
})

describe('Applying a scan (mixed statuses and relocation)', () => {
  it('splits a mixed set into separate checkout and return groups', async () => {
    // Check out only vial 1, so the set then holds one in_use and one available item.
    await BarcodeScanService.applyScan([bc(v1), bc(boxA)], user)

    const out = await BarcodeScanService.applyScan([bc(v1), bc(v2), bc(boxA)], user)
    const byAction = Object.fromEntries(out.applied.map(a => [a.action, a.slugs.length]))
    expect(
      out.failures.length === 0 && byAction.return === 1 && byAction.checkout === 1,
      JSON.stringify(out.applied)
    ).toBe(true)

    const v1After = await ItemService.getItemBySlug(v1.slug)
    const v2After = await ItemService.getItemBySlug(v2.slug)
    expect(
      v1After?.status === 'available' && v2After?.status === 'in_use',
      `v1=${v1After?.status} v2=${v2After?.status}`
    ).toBe(true)

    // Put both back to available before relocating.
    await BarcodeScanService.applyScan([bc(v2), bc(boxA)], user)
  })

  it('relocates a batch to the scanned destination and records both parents', async () => {
    const out = await BarcodeScanService.applyScan(
      [bc(v1), bc(v2), BARCODE_FOR_ACTION.move, bc(boxB)], user)
    expect(
      out.failures.length === 0 && out.applied[0]?.action === 'move',
      JSON.stringify({ applied: out.applied, failures: out.failures })
    ).toBe(true)

    const moved = await ItemService.getItemBySlug(v1.slug)
    expect(moved?.parent?.id, JSON.stringify(moved?.parent)).toBe(boxB._id)

    for (const vial of [v1, v2]) {
      const persisted = await ItemService.getItemBySlug(vial.slug)
      const entry = persisted?.actionLog.at(-1)
      const parentChange = entry?.changes?.find(change => change.field === 'parent')
      expect(
        JSON.stringify(parentChange?.before) === JSON.stringify({ slug: boxA.slug, name: boxA.name, kind: 'container' })
        && JSON.stringify(parentChange?.after) === JSON.stringify({ slug: boxB.slug, name: boxB.name, kind: 'container' }),
        JSON.stringify(parentChange)
      ).toBe(true)
      expect(entry?.notes, String(entry?.notes)).toBe('Applied by barcode scan.')
      expect(entry?.changes?.length, JSON.stringify(entry?.changes)).toBe(1)
      expect(formatChangeValue(parentChange?.after, 'parent')).toBe(`${boxB.name} (${boxB.slug})`)
    }

    const boxAAfter = await ContainerService.getContainerBySlug(boxA.slug)
    const boxBAfter = await ContainerService.getContainerBySlug(boxB.slug)
    const stored = (c: typeof boxAAfter) =>
      (c?.capacity ?? []).reduce((sum, entry) => sum + (entry.stored ?? 0), 0)
    expect(
      stored(boxAAfter) === 0 && stored(boxBAfter) === 2,
      `A=${stored(boxAAfter)} B=${stored(boxBAfter)}`
    ).toBe(true)
  })
})

describe('Item placement audit records', () => {
  it('records grid placement, release and locate independently of the scan note', async () => {
    const gridBox = await ContainerService.createContainer({
      containerType: 'Compartment',
      classification: 'Sample',
      name: 'BCTEST Grid Box',
      parentSlug: equip.slug,
      parentKind: 'equipment',
      capacity: [{ layout: 'grid', childKind: 'item', type: 'cryovial', rows: 2, columns: 2, levels: 2 }]
    }, user)
    createdIds.push(gridBox._id)

    const note = 'Transferred for sequencing.'
    const [inGrid] = await ItemService.moveItem({
      itemSlug: [v1.slug], newParentSlug: gridBox.slug, newParentKind: 'container',
      position: { row: 2, column: 1, level: 2 }, logComment: note
    }, user)
    const positionChange = inGrid!.actionLog.at(-1)?.changes?.find(change => change.field === 'position')
    expect(inGrid!.actionLog.at(-1)?.notes).toBe(note)
    expect(
      positionChange?.before === null
      && JSON.stringify(positionChange?.after) === JSON.stringify(inGrid!.position),
      JSON.stringify(positionChange)
    ).toBe(true)
    expect(formatChangeValue(positionChange?.after, 'position')).toBe('L2-B1 (row 2, column 1, level 2)')
    expect(formatChangeValue({ row: 1, column: 2 }, 'position')).toBe('row 1, column 2, level 1')

    await ItemService.moveItem({
      itemSlug: [v1.slug], newParentSlug: equip.slug, newParentKind: 'equipment'
    }, user)
    const inEquipment = await ItemService.getItemBySlug(v1.slug)
    const equipmentEntry = inEquipment?.actionLog.at(-1)
    const releasedPosition = equipmentEntry?.changes?.find(change => change.field === 'position')
    expect(
      equipmentEntry?.changes?.length === 2
      && JSON.stringify(releasedPosition?.before) === JSON.stringify(inGrid!.position)
      && releasedPosition?.after === null,
      JSON.stringify(equipmentEntry)
    ).toBe(true)
    expect(
      JSON.stringify(equipmentEntry?.changes?.find(change => change.field === 'parent')?.after)
    ).toBe(JSON.stringify({ slug: equip.slug, name: equip.name, kind: 'equipment' }))

    await ItemService.alterItem({ itemSlug: [v1.slug], performedAction: 'post_missing' }, user)
    const out = await BarcodeScanService.applyScan(
      [bc(v1), BARCODE_FOR_ACTION.locate, bc(gridBox)], user, 'Found in the lab.')
    expect(
      out.failures.length === 0 && out.applied[0]?.action === 'locate',
      JSON.stringify(out)
    ).toBe(true)
    const located = await ItemService.getItemBySlug(v1.slug)
    const locateEntry = located?.actionLog.at(-1)
    const statusChange = locateEntry?.changes?.find(change => change.field === 'status')
    expect(
      locateEntry?.notes === 'Applied by barcode scan. Found in the lab.'
      && locateEntry.changes?.length === 3
      && locateEntry.changes.find(change => change.field === 'parent')?.before === null
      && locateEntry.changes.find(change => change.field === 'position')?.before === null
      && statusChange?.before === 'lost' && statusChange.after === 'available',
      JSON.stringify(locateEntry)
    ).toBe(true)

    await ItemService.moveItem({
      itemSlug: [v1.slug], newParentSlug: boxB.slug, newParentKind: 'container'
    }, user)
  })

  it('skips a blocked target rather than applying it', async () => {
    // A blocked target must not be silently executed, and must not abort the rest.
    const out = await BarcodeScanService.applyScan([bc(v1), BARCODE_FOR_ACTION.unreserve], user)
    expect(
      out.applied.length === 0 && out.failures.length === 0,
      JSON.stringify({ applied: out.applied, failures: out.failures })
    ).toBe(true)

    const untouched = await ItemService.getItemBySlug(v1.slug)
    expect(untouched?.status, `status=${untouched?.status}`).toBe('available')
  })

  it('prevents any write when the plan has a plan-level error', async () => {
    const out = await BarcodeScanService.applyScan([bc(v1), BARCODE_FOR_ACTION.move], user)
    expect(
      out.plan.error !== null && out.applied.length === 0,
      JSON.stringify(out.plan.error)
    ).toBe(true)
  })
})

describe('Container placement audit records', () => {
  it('records public source/destination, grid positions and locate for container moves', async () => {
    const moveEquipment = await EquipmentService.createEquipment({
      parentSlug: roomSlug,
      equipmentType: 'Freezer',
      name: 'BCTEST Container Move Freezer',
      capacity: [{ type: 'Box', capacity: 4 }, { type: 'Rack', capacity: 2 }],
      temperatureCategory: 'deep_freezer'
    })
    createdIds.push(moveEquipment._id)
    const gridRack = await ContainerService.createContainer({
      containerType: 'Rack',
      classification: 'Sample',
      name: 'BCTEST Container Grid Rack',
      parentSlug: moveEquipment.slug,
      parentKind: 'equipment',
      capacity: [{ layout: 'grid', childKind: 'container', type: 'Box', rows: 2, columns: 2, levels: 1 }]
    }, user)
    createdIds.push(gridRack._id)
    const boxes: Container[] = []
    for (const name of ['BCTEST Moving Box 1', 'BCTEST Moving Box 2']) {
      const box = await ContainerService.createContainer({
        containerType: 'Box', classification: 'Sample', name, parentSlug: moveEquipment.slug, parentKind: 'equipment'
      }, user)
      createdIds.push(box._id)
      boxes.push(box)
    }
    const [firstBox, secondBox] = boxes
    const out = await BarcodeScanService.applyScan(
      [bc(firstBox!), bc(secondBox!), BARCODE_FOR_ACTION.move, bc(gridRack)], user)
    expect(
      out.failures.length === 0 && out.applied[0]?.slugs.length === 2,
      JSON.stringify(out)
    ).toBe(true)
    for (const box of boxes) {
      const persisted = await ContainerService.getContainerBySlug(box.slug)
      const entry = persisted?.actionLog.at(-1)
      const parentChange = entry?.changes?.find(change => change.field === 'parent')
      const positionChange = entry?.changes?.find(change => change.field === 'positionParent')
      expect(
        JSON.stringify(parentChange?.before) === JSON.stringify({ slug: moveEquipment.slug, name: moveEquipment.name, kind: 'equipment' })
        && JSON.stringify(parentChange?.after) === JSON.stringify({ slug: gridRack.slug, name: gridRack.name, kind: 'container' }),
        JSON.stringify(parentChange)
      ).toBe(true)
      expect(
        positionChange?.before === null && persisted?.positionParent != null
        && JSON.stringify(positionChange?.after) === JSON.stringify(persisted.positionParent),
        JSON.stringify(positionChange)
      ).toBe(true)
      expect(
        entry?.actionType === 'move' && entry.notes === 'Applied by barcode scan.'
        && entry.changes?.length === 2,
        JSON.stringify(entry)
      ).toBe(true)
    }

    const firstBefore = await ContainerService.getContainerBySlug(firstBox!.slug)
    await ContainerService.moveContainer({
      containerSlug: [firstBox!.slug], newParentSlug: moveEquipment.slug, newParentKind: 'equipment',
      logComment: 'Moved for maintenance.'
    }, user)
    const firstAfter = await ContainerService.getContainerBySlug(firstBox!.slug)
    const firstEntry = firstAfter?.actionLog.at(-1)
    const releasedPosition = firstEntry?.changes?.find(change => change.field === 'positionParent')
    expect(
      firstEntry?.notes === 'Moved for maintenance.'
      && JSON.stringify(releasedPosition?.before) === JSON.stringify(firstBefore?.positionParent)
      && releasedPosition?.after === null,
      JSON.stringify(firstEntry)
    ).toBe(true)

    const secondBefore = await ContainerService.getContainerBySlug(secondBox!.slug)
    await ContainerService.moveContainer({
      containerSlug: [secondBox!.slug], newParentSlug: gridRack.slug, newParentKind: 'container',
      position: { row: 2, column: 2 }
    }, user)
    const secondAfter = await ContainerService.getContainerBySlug(secondBox!.slug)
    const secondEntry = secondAfter?.actionLog.at(-1)
    expect(
      secondEntry?.changes?.length === 1 && secondEntry.changes[0]?.field === 'positionParent'
      && JSON.stringify(secondEntry.changes[0].before) === JSON.stringify(secondBefore?.positionParent)
      && JSON.stringify(secondEntry.changes[0].after) === JSON.stringify(secondAfter?.positionParent),
      JSON.stringify(secondEntry)
    ).toBe(true)
    expect(
      formatChangeValue(secondAfter?.positionParent, 'positionParent')
    ).toBe('B2 (row 2, column 2, level 1)')

    await ContainerService.alterContainer({
      containerSlug: [secondBox!.slug], performedAction: 'post_missing'
    }, user)
    const locateOut = await BarcodeScanService.applyScan(
      [bc(secondBox!), BARCODE_FOR_ACTION.locate, bc(gridRack)], user, 'Found the box.')
    expect(
      locateOut.failures.length === 0 && locateOut.applied[0]?.action === 'locate',
      JSON.stringify(locateOut)
    ).toBe(true)
    const located = await ContainerService.getContainerBySlug(secondBox!.slug)
    const locateEntry = located?.actionLog.at(-1)
    const statusChange = locateEntry?.changes?.find(change => change.field === 'status')
    expect(
      locateEntry?.notes === 'Applied by barcode scan. Found the box.'
      && locateEntry.changes?.length === 3
      && locateEntry.changes.find(change => change.field === 'parent')?.before === null
      && locateEntry.changes.find(change => change.field === 'positionParent')?.before === null
      && statusChange?.before === 'lost' && statusChange.after === 'available',
      JSON.stringify(locateEntry)
    ).toBe(true)
    const displayedLog = await ContainerService.getContainerActionLog(secondBox!.slug)
    expect(
      JSON.stringify(displayedLog.at(-1)?.changes)
    ).toBe(JSON.stringify(locateEntry?.changes))
  })
})

describe('Assigning and re-issuing barcodes', () => {
  it('refuses a silent re-issue and records an explicit replacement', async () => {
    const { BarcodeService } = await import('../../server/crud/inventory/barcodes.server')

    let refused = false
    try {
      await BarcodeService.assignBarcode({ entityKind: 'item', slug: v1.slug }, user)
    }
    catch { refused = true }
    expect(refused).toBe(true)

    const before = (await ItemService.getItemBySlug(v1.slug))!.barcode
    const result = await BarcodeService.assignBarcode(
      { entityKind: 'item', slug: v1.slug, replaceExisting: true }, user)
    expect(
      result.previousBarcode === before && result.barcode !== before,
      JSON.stringify(result)
    ).toBe(true)

    const after = await ItemService.getItemBySlug(v1.slug)
    expect(after?.barcode, `stored=${after?.barcode} issued=${result.barcode}`).toBe(result.barcode)

    const lastEntry = (after?.actionLog ?? []).at(-1)
    expect(
      lastEntry?.actionType === 'modify'
      && lastEntry.notes?.includes(result.barcode) === true
      && lastEntry.notes?.includes(before!) === true,
      JSON.stringify(lastEntry)
    ).toBe(true)
    expect(
      (lastEntry?.changes ?? []).some(
        c => c.field === 'barcode' && c.before === before && c.after === result.barcode
      ),
      JSON.stringify(lastEntry?.changes)
    ).toBe(true)

    const oldResolves = await BarcodeScanService.resolveScan([before!], user)
    expect(
      oldResolves.targets.length === 0 && oldResolves.rejected.length === 1,
      JSON.stringify(oldResolves.rejected)
    ).toBe(true)

    const newResolves = await BarcodeScanService.resolveScan([result.barcode], user)
    expect(newResolves.targets[0]?.slug, JSON.stringify(newResolves.targets)).toBe(v1.slug)

    expect(
      (await BarcodeService.assignBarcode(
        { entityKind: 'equipment', slug: equip.slug, replaceExisting: true }, user)).barcode
        .startsWith('fe')
    ).toBe(true)
  })
})
