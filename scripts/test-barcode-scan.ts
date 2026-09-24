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
