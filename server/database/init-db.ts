import { couchDB } from './couchdb'

export async function initializeDatabase() {
  try {
    console.log('Initializing CouchDB database...')
    
    // Ensure the database exists
    await couchDB.ensureDatabase()
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

// Helper function to create indexes for better performance
export async function createIndexes() {
  await couchDB.createIndex(['type', 'userId'])
  await couchDB.createIndex(['type', 'userId', 'completed'])
  await couchDB.createIndex(['type', 'createdAt'])
}
