import 'dotenv/config'
import { DateTime } from 'luxon'
import { couchDB } from './couchdb'
import { createIndexes } from '../crud/indices'
import type { FirnUser } from '../../types/auth'

export async function initializeDatabase() {
  try {
    console.log('Initializing database...')
    
    // Debug: Log environment variables (without sensitive data)
    console.log('Environment check:')
    console.log('- CLOUDANT_URL:', process.env.CLOUDANT_URL ? '****** (set)' : '- (not set)')
    console.log('- CLOUDANT_USERNAME:', process.env.CLOUDANT_USERNAME ? '****** (set)' : '- (not set)')
    console.log('- CLOUDANT_PASSWORD:', process.env.CLOUDANT_PASSWORD ? '****** (set)' : '- (not set)')
    console.log('- CLOUDANT_DATABASE:', process.env.CLOUDANT_DATABASE || 'firn (default)')
    console.log('- FIRST_ADMIN_EMAIL:', process.env.FIRST_ADMIN_EMAIL ? '****** (set)' : '- (not set)')
    
    // Validate database connection first
    await couchDB.validateConnection()
    
    // Ensure database exists
    await couchDB.ensureDatabase()
    console.log('Database ensured')
    
    // Create indexes
    await createIndexes()
    console.log('Indexes created')
    
    // Check if we need to create the first admin user
    const adminUsers = await couchDB.queryDocuments<FirnUser>({
      type: 'user',
      isAdmin: true
    })
    
    // Hopefully, this check adds some extra security, since no further admin user can be created once we already have one.
    if (adminUsers.length === 0) {
      console.log('No admin users found, creating first admin...')
      // Check if FIRST_ADMIN_EMAIL is set and is a valid SciLifeLab email
      if (!process.env.FIRST_ADMIN_EMAIL) {
        throw new Error('FIRST_ADMIN_EMAIL environment variable is required for creating the first admin user')
      }
      
      if (!process.env.FIRST_ADMIN_EMAIL.endsWith('@scilifelab.se')) {
        throw new Error('FIRST_ADMIN_EMAIL must be a SciLifeLab email address.')
      }
      
      // Create first admin user
      const firstAdmin: Omit<FirnUser, '_id' | '_rev'> = {
        type: 'user',
        googleId: 0, // Will be updated when user first logs in from Google OAuth user.
        googleName: '',
        googleGivenName: '',
        googleFamilyName: '',
        googleAvatar: '',
        googleEmail: process.env.FIRST_ADMIN_EMAIL,
        googleEmailVerified: true,
        githubId: null,
        githubNodeId: null,
        githubName: null,
        githubAvatar: null,
        githubEmail: null,
        githubUrl: null,
        createdAt: DateTime.now().toISO(),
        lastSeenAt: DateTime.now().toISO(),
        allowLogin: true,
        isRetired: false,
        isAdmin: true,
        permissions: [],
        tokens: [],
        todos: [],
        preferences: []
      }
      
      const result = await couchDB.createDocument(firstAdmin)
      console.log(`First admin user created with ID: ${result.id}`)
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
if (import.meta.url === `file://${process.argv[1]}`) {
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
