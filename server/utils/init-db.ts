import { ensureDatabase, createIndexes } from './db'

export async function initializeDatabase() {
  try {
    console.log('Initializing CouchDB database...')
    
    // Ensure the database exists
    await ensureDatabase()
    console.log('Database ensured successfully')
    
    // Create indexes for better query performance
    await createIndexes()
    console.log('Indexes created successfully')
    
    console.log('Database initialization completed')
  } catch (error) {
    console.error('Error initializing database:', error)
    throw error
  }
}

// Export for use in server startup
export { initializeDatabase } 