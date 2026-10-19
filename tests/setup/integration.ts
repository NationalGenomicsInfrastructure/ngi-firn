/*
 * Vitest setup for the backend integration suite.
 *
 * This runs before any test file is imported, which is the only safe moment to
 * redirect the application's CouchDB connection at a dedicated test database.
 * The `couchDB` singleton reads `CLOUDANT_DATABASE` once, at construction time,
 * so the override MUST happen here — before the first server module import pulls
 * that singleton in.
 */
import 'dotenv/config'

// The database the tests are allowed to create, fill and wipe. Defaults to a
// name that no application environment uses, so a bare `.env` is still safe.
const TEST_DATABASE = process.env.CLOUDANT_TEST_DATABASE?.trim() || 'firn_test'

// Guard against pointing the destructive fixture lifecycle at a real database.
// If the test database is not distinct from the configured application database,
// refuse to run rather than risk deleting live inventory.
const applicationDatabase = process.env.CLOUDANT_DATABASE?.trim()
if (applicationDatabase && applicationDatabase === TEST_DATABASE) {
  throw new Error(
    `Refusing to run integration tests: CLOUDANT_TEST_DATABASE ("${TEST_DATABASE}") `
    + `must differ from CLOUDANT_DATABASE ("${applicationDatabase}"). `
    + 'Set CLOUDANT_TEST_DATABASE to a disposable database name.'
  )
}

// Redirect every server module to the isolated test database for this process.
process.env.CLOUDANT_DATABASE = TEST_DATABASE
