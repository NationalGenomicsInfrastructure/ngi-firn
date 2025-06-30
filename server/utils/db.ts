import { couchDB } from '../database/couchdb'

// Define the Todo type for CouchDB documents
export interface Todo {
  _id?: string
  _rev?: string
  type: 'todo'
  userId: string // GitHub or Google ID
  title: string
  completed: number // 0 or 1
  createdAt: string // ISO date string
}

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
  await couchDB.createIndex(['type', 'userId'], 'type_userid_idx')
  await couchDB.createIndex(['type', 'userId', 'completed'], 'type_userid_completed_idx')
  await couchDB.createIndex(['type', 'createdAt'], 'type_createdat_idx')
}
