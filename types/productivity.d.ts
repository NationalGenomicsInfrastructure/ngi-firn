import type { BaseDocument } from '../server/database/couchdb'

// Define the Todo type for CouchDB documents
export interface Todo extends BaseDocument {
  type: 'todo'
  userId: string // GitHub or Google ID
  title: string
  completed: number // 0 or 1
  createdAt: string // ISO date string
}
