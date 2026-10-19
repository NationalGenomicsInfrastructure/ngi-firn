/*
 * Shared fixture lifecycle for the backend integration suite.
 *
 * The suite runs against a live CouchDB (the isolated test database configured
 * in tests/setup/integration.ts). Rather than depending on pre-seeded data, it
 * creates everything it needs — the database, the design views, an approved
 * user and a host room — and records every document it creates so the whole
 * fixture can be torn down afterwards.
 */
import { couchDB } from '../../server/database/couchdb'
import { ensureDatabase, ensureViews } from '../../server/crud/views'
import { UserService } from '../../server/crud/users.server'
import { RoomService } from '../../server/crud/inventory/rooms.server'
import type { FirnUser } from '../../types/auth'
import type { Room } from '../../types/inventory'

export interface BaseFixture {
  user: FirnUser
  room: Room
  /* Every document created by the suite, in creation order. */
  createdIds: string[]
}

/* A short random suffix keeps fixture identifiers unique across repeated or
 * interrupted local runs that reuse the same test database. */
function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Ensure the test database and views exist, then create the minimal approved
 * user and host room the barcode fixtures hang off. Both documents are tracked
 * in the returned `createdIds` so cleanup removes them too.
 */
export async function setupBaseFixture(): Promise<BaseFixture> {
  await ensureDatabase()
  await ensureViews()

  const createdIds: string[] = []
  const suffix = uniqueSuffix()

  // createUserByAdmin provisions an active account (allowLogin: true), which is
  // exactly what the authed scan flows expect from an approved user.
  const user = await UserService.createUserByAdmin({
    googleGivenName: 'Barcode',
    googleFamilyName: 'Tester',
    googleEmail: `bctest-${suffix}@scilifelab.se`,
    isAdmin: false
  })
  if (!user) {
    throw new Error('Failed to create the test user fixture.')
  }
  createdIds.push(user._id)

  const room = await RoomService.createRoom({
    name: `BCTEST Room ${suffix}`,
    label: null,
    roomNumber: Math.floor(100 + Math.random() * 900),
    roomType: 'Laboratory',
    building: 'Alfa',
    floor: 1,
    description: null
  })
  createdIds.push(room._id)

  return { user, room, createdIds }
}

/**
 * Delete tracked documents in reverse creation order so children are removed
 * before their parents. Cleanup failures are reported but never thrown, so one
 * stuck document cannot block the removal of the rest.
 */
export async function cleanupFixture(createdIds: string[]): Promise<void> {
  for (const id of [...createdIds].reverse()) {
    try {
      const doc = await couchDB.getDocument<{ _id: string, _rev: string }>(id)
      if (doc) {
        await couchDB.deleteDocument(id, doc._rev)
      }
    }
    catch (error) {
      console.error(`  failed to clean up ${id}: ${(error as Error).message}`)
    }
  }
}
