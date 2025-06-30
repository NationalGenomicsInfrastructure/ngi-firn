import { couchDB } from './couchdb'
import { createIndexes } from '../utils/db'
import type { User } from '../../types/user'

export async function initializeDatabase() {
  try {
    console.log('Initializing database...')
    
    // Ensure database exists
    await couchDB.ensureDatabase()
    console.log('Database ensured')
    
    // Create indexes
    await createIndexes()
    console.log('Indexes created')
    
    // Check if we need to create the first admin user
    const adminUsers = await couchDB.queryDocuments<User>({
      type: 'user',
      isAdmin: true
    })
    
    if (adminUsers.length === 0) {
      console.log('No admin users found, creating first admin...')
      
      // Create first admin user (this should be replaced with actual admin creation)
      const firstAdmin: Omit<User, '_id' | '_rev'> = {
        type: 'user',
        provider: 'google',
        name: 'System Administrator',
        avatar: '',
        email: process.env.FIRST_ADMIN_EMAIL || 'admin@example.com',
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        isAdmin: true,
        permissions: ['admin', 'approved'],
        tokens: [],
        sessions: [],
        todos: [],
        settings: {},
        preferences: {}
      }
      
      const result = await couchDB.createDocument(firstAdmin)
      console.log(`First admin user created with ID: ${result.id}`)
      console.log('Please update the admin email and credentials after first login')
    } else {
      console.log(`Found ${adminUsers.length} admin user(s)`)
    }
    
    console.log('Database initialization completed successfully')
  } catch (error) {
    console.error('Error initializing database:', error)
    throw error
  }
}

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialization completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Database initialization failed:', error)
      process.exit(1)
    })
}
