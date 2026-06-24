import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CloudantV1 } from '@ibm-cloud/cloudant'
import { couchDB, loadDesignDoc, upsertDesignDoc } from '../database/couchdb'
import { PROJECTS_DB_NAME } from './projects.server'

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

/* Local cache directory for design docs pulled from the read-only projects database. */
const PROJECTS_VIEWS_DIR = ['server', 'database', 'couchdb-views', 'projects']

/* A pulled design doc normalized to the same shape as our managed view files (no _rev). */
interface CachedDesignDoc {
  _id: string
  language: string
  views: Record<string, unknown>
}

/* Strip CouchDB metadata (_rev, etc.) so the cached file is a clean reference artifact. */
function normalizeDesignDoc(doc: CloudantV1.DesignDocument): CachedDesignDoc {
  return {
    _id: doc._id as string,
    language: (doc.language as string | undefined) ?? 'javascript',
    views: (doc.views as Record<string, unknown> | undefined) ?? {}
  }
}

/* Turn a design doc id (e.g. '_design/project') into a cache filename ('project.json'). */
function designDocFileName(id: string): string {
  return `${id.replace(/^_design\//, '')}.json`
}

/**
 * Pull every design document from the read-only projects database into a local,
 * gitignored cache (server/database/couchdb-views/projects/) so the view
 * definitions are available in context for optimizing queries.
 *
 * Diff-aware: reports added / changed / unchanged / removed views and only
 * writes files whose content differs from the current cache. The projects DB
 * is the source of truth and is never written to.
 */
export async function pullProjectsViews(): Promise<void> {
  const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)

  const info = await projectsDB.getDatabaseInformation()
  if (!info) {
    console.warn(`⚠️  Projects database "${PROJECTS_DB_NAME}" is unavailable; nothing to pull.`)
    return
  }

  const designDocs = await projectsDB.listDesignDocuments()
  const targetDir = join(process.cwd(), ...PROJECTS_VIEWS_DIR)
  await mkdir(targetDir, { recursive: true })

  const added: string[] = []
  const changed: string[] = []
  const unchanged: string[] = []
  const seenFiles = new Set<string>()

  for (const doc of designDocs) {
    if (!doc._id) {
      continue
    }

    const fileName = designDocFileName(doc._id)
    seenFiles.add(fileName)
    const filePath = join(targetDir, fileName)
    const nextContent = `${JSON.stringify(normalizeDesignDoc(doc), null, 2)}\n`

    let existing: string | null = null
    try {
      existing = await readFile(filePath, 'utf-8')
    }
    catch (error: unknown) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        throw error
      }
    }

    if (existing === null) {
      await writeFile(filePath, nextContent)
      added.push(fileName)
    }
    else if (existing !== nextContent) {
      await writeFile(filePath, nextContent)
      changed.push(fileName)
    }
    else {
      unchanged.push(fileName)
    }
  }

  // Report cached files that no longer exist remotely (left in place, not deleted).
  let removed: string[]
  try {
    const cachedFiles = await readdir(targetDir)
    removed = cachedFiles.filter(name => name.endsWith('.json') && !seenFiles.has(name))
  }
  catch {
    removed = []
  }

  console.log(`📥 Pulled ${designDocs.length} design doc(s) from "${PROJECTS_DB_NAME}" into ${PROJECTS_VIEWS_DIR.join('/')}/`)
  if (added.length) console.log(`   + added:     ${added.join(', ')}`)
  if (changed.length) console.log(`   ~ changed:   ${changed.join(', ')}`)
  if (unchanged.length) console.log(`   = unchanged: ${unchanged.join(', ')}`)
  if (removed.length) console.log(`   ! stale (no longer in projects DB, kept): ${removed.join(', ')}`)
}
