#!/usr/bin/env node
/*
 * Integration test for the inventory barcode scan resolver.
 *
 * This exercises `BarcodeScanService.resolveScan` against a real CouchDB, because
 * the resolver's interesting behaviour — ancestry walking, role classification and
 * the status/action matrix — only emerges from real stored documents. It creates
 * its own throwaway fixture (prefixed `BCTEST`) and deletes it again, so it never
 * touches existing inventory.
 *
 * Run with: pnpm test:barcode
 */

/* Loads .env before the CouchDB client module reads its connection settings. */
import 'dotenv/config'

import { couchDB } from '../server/database/couchdb'
import { ensureViews } from '../server/crud/views'
import { EquipmentService } from '../server/crud/inventory/equipment.server'
import { ContainerService } from '../server/crud/inventory/containers.server'
import { ItemService } from '../server/crud/inventory/items.server'
import { BarcodeScanService } from '../server/crud/inventory/barcode-scan.server'
import { BARCODE_FOR_ACTION, parseBarcode } from '../schemas/inventory/barcode'
import type { BarcodeScanPlan } from '../types/inventory'
import type { FirnUser } from '../types/auth'

const createdIds: string[] = []
let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  }
  else {
    failures.push(label)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

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

async function getUser(): Promise<FirnUser> {
  const { UserService } = await import('../server/crud/users.server')
  const user = (await UserService.getApprovedUsers())[0]
  if (!user) throw new Error('no approved firnUser in the database')
  return user
}

async function run() {
  await ensureViews()
  const user = await getUser()

  const rooms = await couchDB.queryView<unknown, { slug: string }>('firn-inventory', 'by_type', {
    key: 'room', include_docs: true, limit: 1, reduce: false
  })
  const roomSlug = rooms.rows[0]?.doc?.slug
  if (!roomSlug) throw new Error('no room in the database to host the fixture')

  // ---- Fixture: one freezer, two boxes inside it, two vials inside box A ----
  const equip = await EquipmentService.createEquipment({
    parentSlug: roomSlug,
    equipmentType: 'Freezer',
    name: 'BCTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'minus80'
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

  const boxA = await makeBox('BCTEST Box A')
  const boxB = await makeBox('BCTEST Box B')

  const vials = []
  for (const name of ['BCTEST Vial 1', 'BCTEST Vial 2']) {
    const vial = await ItemService.createItem({
      category: 'cryovial', name, parentSlug: boxA.slug, parentKind: 'container'
    }, user)
    createdIds.push(vial._id)
    vials.push(vial)
  }
  const [v1, v2] = vials
  const bc = (x: { barcode: string | null }) => x.barcode!

  console.log('\nBarcode assignment')
  for (const [label, doc, kind] of [
    ['equipment', equip, 'equipment'], ['container', boxA, 'container'], ['item', v1, 'item']
  ] as const) {
    const parsed = parseBarcode(bc(doc))
    check(
      `${label} is auto-assigned a valid ${kind} barcode`,
      parsed.kind === 'entity' && parsed.entityKind === kind,
      `got ${bc(doc)} -> ${JSON.stringify(parsed)}`
    )
  }
  check(
    'every fixture barcode is distinct',
    new Set([equip, boxA, boxB, v1, v2].map(bc)).size === 5
  )

  console.log('\nDefault checkout/return toggle')
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(v2), bc(boxA)]))
    check('enclosing container becomes context, items become targets',
      p.contextKind === 'container' && p.context === 'BCTEST Box A'
      && p.targets.join('|') === 'BCTEST Vial 1:checkout:exec|BCTEST Vial 2:checkout:exec',
      JSON.stringify(p))
    check('no warnings when the scanned container really is the parent',
      p.warnings.length === 0, JSON.stringify(p.warnings))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(boxA), bc(equip)]))
    check('an enclosing container is preferred over the equipment',
      p.context === 'BCTEST Box A' && p.warnings.includes('context_ignored'), JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(equip)]))
    check('grandparent equipment as context warns about the parent mismatch',
      p.context === 'BCTEST Freezer' && p.warnings.includes('parent_mismatch'), JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(boxA)]))
    check('a container scanned alone is a target, not context',
      p.context === null && p.targets.join('|') === 'BCTEST Box A:checkout:exec', JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), bc(boxB)]))
    check('a container that encloses nothing scanned is a target',
      p.context === null && p.targets.length === 2, JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(equip)]))
    check('scanning only a location is an error, not a silent no-op',
      p.error !== null && p.targets.length === 0, JSON.stringify(p))
  }

  console.log('\nRelocating actions')
  {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), bc(v2), BARCODE_FOR_ACTION.move, bc(boxB)]))
    check('move treats the last scanned location as the destination',
      p.action === 'move' && p.context === 'BCTEST Box B'
      && p.targets.every(t => t.endsWith(':move:exec')) && p.targets.length === 2,
      JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), BARCODE_FOR_ACTION.move]))
    check('move without a destination is rejected', p.error !== null, JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), BARCODE_FOR_ACTION.locate, bc(boxB)]))
    check('locate is blocked on an entity that is not lost',
      p.targets.join('|') === 'BCTEST Vial 1:locate:blocked', JSON.stringify(p))
  }

  console.log('\nAction cards and the status matrix')
  {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), bc(v2), BARCODE_FOR_ACTION.dispose]))
    check('dispose applies to every target',
      p.action === 'dispose' && p.targets.every(t => t.endsWith(':dispose:exec')), JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1), BARCODE_FOR_ACTION.unreserve]))
    check('an action the status forbids yields a blocked target, not an error',
      p.error === null && p.targets.join('|') === 'BCTEST Vial 1:unreserve:blocked', JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), BARCODE_FOR_ACTION.dispose, BARCODE_FOR_ACTION.reserve]))
    check('two conflicting action cards abort the scan', p.error !== null, JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan(
      [bc(v1), BARCODE_FOR_ACTION.dispose, BARCODE_FOR_ACTION.dispose]))
    check('the same action card scanned twice is tolerated',
      p.error === null && p.action === 'dispose' && p.warnings.includes('duplicate_scan'),
      JSON.stringify(p))
  }

  console.log('\nMalformed and unknown input')
  {
    const p = summarize(await BarcodeScanService.resolveScan(
      ['hello', 'fi00000000x', 'ftabcdefghi', bc(v1), bc(v1)]))
    check('bad codes are reported without aborting the usable part of the scan',
      p.targets.join('|') === 'BCTEST Vial 1:checkout:exec' && p.rejected.length === 3,
      JSON.stringify(p))
    check('a login token is rejected specifically',
      p.rejected.some(r => r.startsWith('ftabcdefghi:')), JSON.stringify(p.rejected))
    check('a duplicate scan of the same entity is de-duplicated',
      p.warnings.includes('duplicate_scan'), JSON.stringify(p.warnings))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([]))
    check('an empty scan is an error', p.error !== null, JSON.stringify(p))
  }
  {
    const p = summarize(await BarcodeScanService.resolveScan([bc(v1).toUpperCase()]))
    check('an uppercase scan still resolves',
      p.targets.join('|') === 'BCTEST Vial 1:checkout:exec', JSON.stringify(p))
  }

  console.log('\nApplying a scan (checkout / return round trip)')
  {
    const set = [bc(v1), bc(v2), bc(boxA)]

    const out1 = await BarcodeScanService.applyScan(set, user)
    check('checkout applies to both vials in one grouped call',
      out1.failures.length === 0 && out1.applied.length === 1
      && out1.applied[0]!.action === 'checkout' && out1.applied[0]!.slugs.length === 2,
      JSON.stringify({ applied: out1.applied, failures: out1.failures }))

    const afterCheckout = await ItemService.getItemBySlug(v1.slug)
    check('the vial is persisted as in_use', afterCheckout?.status === 'in_use',
      `status=${afterCheckout?.status}`)
    check('checkout does not unplace the item',
      afterCheckout?.parent?.id === boxA._id, JSON.stringify(afterCheckout?.parent))

    // Re-scanning the very same set must now mean the opposite, with no action card.
    const replan = summarize(await BarcodeScanService.resolveScan(set))
    check('re-scanning the same set now proposes return, not checkout',
      replan.targets.every(t => t.includes(':return:')), JSON.stringify(replan))

    const out2 = await BarcodeScanService.applyScan(set, user)
    check('return applies cleanly',
      out2.failures.length === 0 && out2.applied[0]?.action === 'return',
      JSON.stringify({ applied: out2.applied, failures: out2.failures }))

    const afterReturn = await ItemService.getItemBySlug(v1.slug)
    check('the vial is back to available', afterReturn?.status === 'available',
      `status=${afterReturn?.status}`)
  }

  console.log('\nApplying a scan (mixed statuses and relocation)')
  {
    // Check out only vial 1, so the set then holds one in_use and one available item.
    await BarcodeScanService.applyScan([bc(v1), bc(boxA)], user)

    const out = await BarcodeScanService.applyScan([bc(v1), bc(v2), bc(boxA)], user)
    const byAction = Object.fromEntries(out.applied.map(a => [a.action, a.slugs.length]))
    check('a mixed set is split into separate checkout and return groups',
      out.failures.length === 0 && byAction.return === 1 && byAction.checkout === 1,
      JSON.stringify(out.applied))

    const v1After = await ItemService.getItemBySlug(v1.slug)
    const v2After = await ItemService.getItemBySlug(v2.slug)
    check('each item moved in its own direction',
      v1After?.status === 'available' && v2After?.status === 'in_use',
      `v1=${v1After?.status} v2=${v2After?.status}`)

    // Put both back to available before relocating.
    await BarcodeScanService.applyScan([bc(v2), bc(boxA)], user)
  }
  {
    const out = await BarcodeScanService.applyScan(
      [bc(v1), bc(v2), BARCODE_FOR_ACTION.move, bc(boxB)], user)
    check('move relocates the batch to the scanned destination',
      out.failures.length === 0 && out.applied[0]?.action === 'move',
      JSON.stringify({ applied: out.applied, failures: out.failures }))

    const moved = await ItemService.getItemBySlug(v1.slug)
    check('the item now really lives in box B', moved?.parent?.id === boxB._id,
      JSON.stringify(moved?.parent))

    const boxAAfter = await ContainerService.getContainerBySlug(boxA.slug)
    const boxBAfter = await ContainerService.getContainerBySlug(boxB.slug)
    const stored = (c: typeof boxAAfter) =>
      (c?.capacity ?? []).reduce((sum, entry) => sum + (entry.stored ?? 0), 0)
    check('capacity counters follow the move (A emptied, B filled)',
      stored(boxAAfter) === 0 && stored(boxBAfter) === 2,
      `A=${stored(boxAAfter)} B=${stored(boxBAfter)}`)
  }
  {
    // A blocked target must not be silently executed, and must not abort the rest.
    const out = await BarcodeScanService.applyScan([bc(v1), BARCODE_FOR_ACTION.unreserve], user)
    check('a blocked target is skipped rather than applied',
      out.applied.length === 0 && out.failures.length === 0,
      JSON.stringify({ applied: out.applied, failures: out.failures }))

    const untouched = await ItemService.getItemBySlug(v1.slug)
    check('the blocked target is left unchanged', untouched?.status === 'available',
      `status=${untouched?.status}`)
  }
  {
    const out = await BarcodeScanService.applyScan([bc(v1), BARCODE_FOR_ACTION.move], user)
    check('a plan-level error prevents any write',
      out.plan.error !== null && out.applied.length === 0, JSON.stringify(out.plan.error))
  }

  console.log('\nAssigning and re-issuing barcodes')
  {
    const { BarcodeService } = await import('../server/crud/inventory/barcodes.server')

    let refused = false
    try {
      await BarcodeService.assignBarcode({ entityKind: 'item', slug: v1.slug }, user)
    }
    catch { refused = true }
    check('re-issuing over an existing barcode is refused without an opt-in', refused)

    const before = (await ItemService.getItemBySlug(v1.slug))!.barcode
    const result = await BarcodeService.assignBarcode(
      { entityKind: 'item', slug: v1.slug, replaceExisting: true }, user)
    check('an explicit re-issue reports the barcode it replaced',
      result.previousBarcode === before && result.barcode !== before,
      JSON.stringify(result))

    const after = await ItemService.getItemBySlug(v1.slug)
    check('the new barcode is persisted', after?.barcode === result.barcode,
      `stored=${after?.barcode} issued=${result.barcode}`)

    const lastEntry = (after?.actionLog ?? []).at(-1)
    check('the re-issue is recorded as a modify entry naming the orphaned label',
      lastEntry?.actionType === 'modify'
      && lastEntry.notes?.includes(result.barcode) === true
      && lastEntry.notes?.includes(before!) === true,
      JSON.stringify(lastEntry))
    check('the re-issue records a structured before/after change',
      (lastEntry?.changes ?? []).some(
        c => c.field === 'barcode' && c.before === before && c.after === result.barcode
      ),
      JSON.stringify(lastEntry?.changes))

    const oldResolves = await BarcodeScanService.resolveScan([before!])
    check('the replaced label no longer resolves',
      oldResolves.targets.length === 0 && oldResolves.rejected.length === 1,
      JSON.stringify(oldResolves.rejected))

    const newResolves = await BarcodeScanService.resolveScan([result.barcode])
    check('the newly issued label resolves to the same entity',
      newResolves.targets[0]?.slug === v1.slug, JSON.stringify(newResolves.targets))

    check('equipment can be re-issued too, despite having no action log',
      (await BarcodeService.assignBarcode(
        { entityKind: 'equipment', slug: equip.slug, replaceExisting: true }, user)).barcode
        .startsWith('fe'))
  }
}

async function cleanup() {
  for (const id of createdIds.reverse()) {
    try {
      const doc = await couchDB.getDocument<{ _id: string, _rev: string }>(id)
      if (doc) await couchDB.deleteDocument(id, doc._rev)
    }
    catch (error) {
      console.error(`  failed to clean up ${id}: ${(error as Error).message}`)
    }
  }
}

run()
  .catch((error) => {
    failures.push('unexpected exception')
    console.error('\nUnexpected exception:', error)
  })
  .finally(async () => {
    console.log('\nCleaning up fixture...')
    await cleanup()
    console.log(`\n${passed} passed, ${failures.length} failed`)
    for (const f of failures) console.log(`  failed: ${f}`)
    process.exit(failures.length > 0 ? 1 : 0)
  })
