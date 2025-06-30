import { useDB, createIndexes } from '../utils/db'

export async function initializeDatabase() {
  try {
    console.log('Initializing CouchDB database...')

    // Ensure the database exists
    await useDB().ensureDatabase()
    console.log('Database ensured successfully')

    // Create indexes for better query performance
    await createIndexes()
    console.log('Indexes created successfully')

    console.log('Database initialization completed')
  }
  catch (error) {
    console.error('Error initializing database:', error)
    throw error
  }
}
