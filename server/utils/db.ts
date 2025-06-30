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
  await couchDB.createIndex(['type', 'userId'])
  await couchDB.createIndex(['type', 'userId', 'completed'])
  await couchDB.createIndex(['type', 'createdAt'])
}

// Export the Todo type for use in API endpoints
export type { Todo }
