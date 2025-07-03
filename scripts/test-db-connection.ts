#!/usr/bin/env node

import { validateDatabaseConnection } from '../server/database/couchdb'

async function main() {
  try {
    console.log('🛋 Testing database connection...')
    await validateDatabaseConnection()
    console.log('✅ Database connection test passed!')
  } catch (error) {
    console.error('❌ Database connection test failed:', error)
    process.exit(1)
  }
}

main() 