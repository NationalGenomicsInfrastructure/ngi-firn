import { couchDB, loadDesignDoc, upsertDesignDoc } from '../database/couchdb'

// Helper function to get CouchDB instance
export function useDB() {
  return couchDB
}

// Helper function to ensure database exists
export async function ensureDatabase() {
  await couchDB.ensureDatabase()
}

/* Ensure all design-doc view sets are available in CouchDB. */
export async function ensureViews(): Promise<void> {
  const designDocs = await Promise.all([
    loadDesignDoc(['server', 'database', 'couchdb-views', 'firn-users.json'], '_design/firn-users'),
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
