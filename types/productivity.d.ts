import type { BaseDocument } from '../server/database/couchdb'

// Define the Todo type for CouchDB documents
export interface Todo extends BaseDocument {
  type: 'todo'
  schema: 1
}
