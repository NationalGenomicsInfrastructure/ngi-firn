/*
 * Database redirection and safety guard for the Bombadil browser pilot.
 *
 * The Bombadil harness must only ever touch a disposable test database — never
 * the application database (`CLOUDANT_DATABASE`) nor any staging database that
 * holds real inventory. This module mirrors the backend integration guard in
 * `tests/setup/integration.ts`: it must be imported *before* any server module,
 * because the `couchDB` singleton reads `CLOUDANT_DATABASE` once at construction
 * time, so the redirect has to happen before that first import.
 *
 * Importing this module for its side effect is intentional:
 *
 *   import './env'          // redirect + guard, nothing exported used
 */
import 'dotenv/config'

/* The database the pilot is allowed to create, fill and wipe. Defaults to a name
 * that no application environment uses, so a bare `.env` is still safe. The same
 * value must be exported to the Nuxt process the harness starts, so the app and
 * the seeder agree on which database they operate against. */
export const BOMBADIL_TEST_DATABASE
  = process.env.CLOUDANT_TEST_DATABASE?.trim() || 'firn_bombadil'

/* Refuse to run the destructive fixture lifecycle against a real database. */
const applicationDatabase = process.env.CLOUDANT_DATABASE?.trim()
if (applicationDatabase && applicationDatabase === BOMBADIL_TEST_DATABASE) {
  throw new Error(
    `Refusing to run the Bombadil pilot: CLOUDANT_TEST_DATABASE ("${BOMBADIL_TEST_DATABASE}") `
    + `must differ from CLOUDANT_DATABASE ("${applicationDatabase}"). `
    + 'Set CLOUDANT_TEST_DATABASE to a disposable database name.'
  )
}

/* Redirect every server module in this process to the isolated test database. */
process.env.CLOUDANT_DATABASE = BOMBADIL_TEST_DATABASE

/* Absolute, gitignored location the harness scripts exchange state through. The
 * seed step writes it, the login and cleanup steps read it. It holds the IDs of
 * every created document and the ephemeral login token — so it must never be
 * committed or uploaded as a CI artifact. */
export const ARTIFACT_DIR = new URL('../.artifacts/', import.meta.url)
export const ARTIFACT_FILE = new URL('fixture.json', ARTIFACT_DIR)
export const JOURNAL_FILE = new URL('created-ids.json', ARTIFACT_DIR)

export interface BombadilArtifact {
  /* Every document created by the seeder, in creation order. */
  createdIds: string[]
  /* Ephemeral QR login token (raw JWT) for the seeded approved user. */
  token: string
  /* Human-readable fixture summary, handy when inspecting a run. */
  user: { email: string, firnId: string }
  room: { slug: string, name: string }
  /* Barcodes of the seeded entities, so a spec or a human can target them. */
  barcodes: {
    freezer: string | null
    boxA: string | null
    boxB: string | null
    vial1: string | null
    vial2: string | null
  }
}
