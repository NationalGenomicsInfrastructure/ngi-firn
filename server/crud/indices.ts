import { couchDB } from '../database/couchdb'
import type { Todo } from '../../types/productivity'

// Helper function to get CouchDB instance
export function useDB() {
  return couchDB
}

// Helper function to ensure database exists
export async function ensureDatabase() {
  await couchDB.ensureDatabase()
}

// Helper function to create indexes for better performance
export async function createIndexes() {
  // Todo indexes
  await couchDB.createIndex(['type', 'userId'])
  await couchDB.createIndex(['type', 'userId', 'completed'])
  await couchDB.createIndex(['type', 'createdAt'])

  // User indexes
  await couchDB.createIndex(['type', 'email'])
  await couchDB.createIndex(['type', 'googleId'])
  await couchDB.createIndex(['type', 'githubId'])
  await couchDB.createIndex(['type', 'permissions'])
  await couchDB.createIndex(['type', 'isAdmin'])
  await couchDB.createIndex(['type', 'allowLogin'])
  await couchDB.createIndex(['type', 'isRetired'])
  await couchDB.createIndex(['type', 'allowLogin', 'isRetired'])
  await couchDB.createIndex(['type', 'createdAt'])
}

// Export the Todo type for use in API endpoints
export type { Todo }
