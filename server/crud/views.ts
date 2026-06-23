import { couchDB, loadDesignDoc, upsertDesignDoc } from '../database/couchdb'

// Helper function to get CouchDB instance
export function useDB() {
  return couchDB
}

// Helper function to ensure database exists
export async function ensureDatabase() {
  await couchDB.ensureDatabase()
}

/* Ensure both inventory design-doc view sets are available in CouchDB. */
export async function ensureInventoryViews(): Promise<void> {
  const designDocs = await Promise.all([
    loadDesignDoc(['server', 'database', 'couchdb-views', 'firn-inventory.json'], '_design/firn-inventory'),
    loadDesignDoc(['server', 'database', 'couchdb-views', 'firn-inventory-actions.json'], '_design/firn-inventory-actions')
  ])

  for (const designDoc of designDocs) {
    if (!designDoc) {
      continue
    }

    await upsertDesignDoc(designDoc)
  }
}

// Helper function to create indexes for better performance
export async function createIndexes() {
  // Todo indexes
  await couchDB.createIndex(['type', 'userId'])
  await couchDB.createIndex(['type', 'userId', 'completed'])
  await couchDB.createIndex(['type', 'createdAt'])

  // User indexes
  await couchDB.createIndex(['type', 'email'])
  await couchDB.createIndex(['type', 'googleId'])
  await couchDB.createIndex(['type', 'githubId'])
  await couchDB.createIndex(['type', 'permissions'])
  await couchDB.createIndex(['type', 'isAdmin'])
  await couchDB.createIndex(['type', 'allowLogin'])
  await couchDB.createIndex(['type', 'isRetired'])
  await couchDB.createIndex(['type', 'allowLogin', 'isRetired'])
  await couchDB.createIndex(['type', 'createdAt'])
}
