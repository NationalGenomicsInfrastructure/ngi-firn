import { ARTIFACT_DIR, ARTIFACT_FILE, BOMBADIL_TEST_DATABASE, JOURNAL_FILE } from './env'
import { rm } from 'node:fs/promises'
import { cleanupJournal } from './journal'
import { couchDB } from '../../../server/database/couchdb'

async function main() {
  try {
    await cleanupJournal(JOURNAL_FILE, BOMBADIL_TEST_DATABASE, async (id) => {
      const document = await couchDB.getDocument<{ _id: string, _rev: string }>(id)
      if (document) await couchDB.deleteDocument(id, document._rev)
    })
  }
  finally {
    // The retry journal contains only document IDs, never credentials.
    await rm(new URL('cookie.txt', ARTIFACT_DIR), { force: true })
    await rm(ARTIFACT_FILE, { force: true })
  }
}

main().catch((error) => {
  console.error('Bombadil cleanup failed:', error)
  process.exitCode = 1
})
