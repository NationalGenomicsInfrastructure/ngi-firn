import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'

const journalSchema = z.object({
  database: z.string().min(1),
  createdIds: z.array(z.string().min(1))
})

export async function createJournal(path: URL, database: string) {
  const journal = { database, createdIds: [] as string[] }
  await writeFile(path, JSON.stringify(journal), { mode: 0o600, flag: 'wx' })
  return async (id: string) => {
    journal.createdIds.push(id)
    await saveJournal(path, journal)
  }
}

async function saveJournal(path: URL, journal: z.infer<typeof journalSchema>) {
  const temporary = new URL(`${path.href}.tmp`)
  await writeFile(temporary, JSON.stringify(journal), { mode: 0o600 })
  await rename(temporary, path)
}

export async function cleanupJournal(path: URL, database: string, remove: (id: string) => Promise<void>) {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  const journal = journalSchema.parse(JSON.parse(text))
  if (journal.database !== database) {
    throw new Error(`Cleanup journal belongs to "${journal.database}", not "${database}".`)
  }
  const failures: unknown[] = []
  for (const id of [...journal.createdIds].reverse()) {
    try {
      await remove(id)
      journal.createdIds = journal.createdIds.filter(created => created !== id)
    }
    catch (error) {
      failures.push(new Error(`Failed to remove fixture document ${id}`, { cause: error }))
    }
  }
  if (failures.length) {
    await saveJournal(path, journal)
    throw new AggregateError(failures, 'Fixture cleanup incomplete; journal retained for retry.')
  }
  await rm(path)
  await rm(new URL(`${path.href}.tmp`), { force: true })
}
