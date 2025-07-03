import { validateDatabaseConnection } from '../database/couchdb'

export default defineNitroPlugin(async () => {
try {
    // Validate database connection before starting the server
    await validateDatabaseConnection()
} catch (error) {
    console.error('❌ Fatal error during database validation:', error)
    process.exit(1)
}
}) 