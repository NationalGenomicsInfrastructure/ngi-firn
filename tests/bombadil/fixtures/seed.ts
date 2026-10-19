/*
 * Seed step of the Bombadil browser pilot.
 *
 * Creates a self-contained, disposable fixture in the isolated test database and
 * writes an artifact describing it (see `BombadilArtifact`). Nothing here starts
 * the application or a browser: it only provisions data and an ephemeral login
 * token, so the orchestrator can start Nuxt against the same test database and
 * exchange the token for a session cookie afterwards.
 *
 * Every created document is recorded in the artifact so `cleanup.ts` can remove
 * the whole fixture again, exactly like the backend integration suite does.
 *
 * Run (after `./env` has redirected the database): tsx tests/bombadil/fixtures/seed.ts
 */
import './env'
import { mkdir, writeFile } from 'node:fs/promises'
import { ARTIFACT_DIR, ARTIFACT_FILE, BOMBADIL_TEST_DATABASE, JOURNAL_FILE, type BombadilArtifact } from './env'
import { createJournal } from './journal'
import { setupBaseFixture } from '../../integration/fixtures'
import { tokenHandler } from '../../../server/security/tokens.server'
import { EquipmentService } from '../../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../../server/crud/inventory/containers.server'
import { ItemService } from '../../../server/crud/inventory/items.server'

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true })
  const track = await createJournal(JOURNAL_FILE, BOMBADIL_TEST_DATABASE)
  // Approved user + host room, tracked for cleanup. Prefixed `BCTEST` like the
  // integration fixtures, so stray documents are easy to spot and sweep.
  const base = await setupBaseFixture(track)
  const createdIds = [...base.createdIds]

  // One freezer, two boxes inside it, two vials inside box A — enough hierarchy
  // for the scanner's info lookups and basket actions to have something real to
  // resolve against.
  const freezer = await EquipmentService.createEquipment({
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    name: 'BCTEST Bombadil Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(freezer._id)
  await track(freezer._id)

  const makeBox = async (name: string) => {
    const box = await ContainerService.createContainer({
      containerType: 'Compartment',
      classification: 'Sample',
      name,
      parentSlug: freezer.slug,
      parentKind: 'equipment',
      capacity: [{ layout: 'count', childKind: 'item', type: 'cryovial', capacity: 20 }]
    }, base.user)
    createdIds.push(box._id)
    await track(box._id)
    return box
  }

  const boxA = await makeBox('BCTEST Bombadil Box A')
  const boxB = await makeBox('BCTEST Bombadil Box B')

  const makeVial = async (name: string) => {
    const vial = await ItemService.createItem({
      category: 'cryovial', name, parentSlug: boxA.slug, parentKind: 'container'
    }, base.user)
    createdIds.push(vial._id)
    await track(vial._id)
    return vial
  }

  const vial1 = await makeVial('BCTEST Bombadil Vial 1')
  const vial2 = await makeVial('BCTEST Bombadil Vial 2')

  // A short-lived QR login token (a raw JWT) for the approved user. The
  // orchestrator POSTs this to the running app to obtain a real session cookie,
  // which it then injects into Bombadil's browser with `--cookie`. One hour is
  // ample for a pilot run and keeps the credential disposable.
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const issued = await tokenHandler.generateFirnUserToken(base.user, 'qrcode', 'User Login', expiresAt)
  if (!issued) {
    throw new Error('Failed to issue a login token for the Bombadil fixture user.')
  }
  // Token issuance mutates the user document (_rev); it is already tracked.

  const artifact: BombadilArtifact = {
    createdIds,
    token: issued.jwt,
    user: { email: base.user.googleEmail, firnId: base.user.firnId },
    room: { slug: base.room.slug, name: base.room.name },
    barcodes: {
      freezer: freezer.barcode,
      boxA: boxA.barcode,
      boxB: boxB.barcode,
      vial1: vial1.barcode,
      vial2: vial2.barcode
    }
  }

  await mkdir(ARTIFACT_DIR, { recursive: true })
  await writeFile(ARTIFACT_FILE, JSON.stringify(artifact, null, 2), { mode: 0o600 })

  console.log(`Seeded Bombadil fixture: ${createdIds.length} documents, user ${artifact.user.email}.`)
}

main().catch((error) => {
  console.error('Bombadil seed failed:', error)
  process.exit(1)
})
