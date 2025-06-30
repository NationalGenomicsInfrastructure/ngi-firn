import { CloudantV1 } from '@ibm-cloud/cloudant';

// Define the Todo type for CouchDB documents
export interface Todo extends CloudantV1.Document {
  _id?: string
  _rev?: string
  type: 'todo'
  userId: string // GitHub or Google ID
  title: string
  completed: number // 0 or 1
  createdAt: string // ISO date string
}




