import type { BaseDocument } from '../server/database/couchdb'
import type { FirnUser } from './auth'
import type { TypedDocumentReference } from './references'

// =============================================================================================
// Productivity / ToDo documents
// =============================================================================================

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'archived'

// A single ToDo entry belonging to a user.
export interface TodoItem {
  // Stable identifier, unique within a TodoDocument.
  id: string
  // Short, human-readable summary.
  title: string
  // Optional long-form description or notes.
  body?: string
  // Optional tags for filtering, e.g. ["bioinfo", "urgent"].
  tags?: string[]
  // Optional ISO-8601 date/time string for when this ToDo is due.
  dueDate?: string
  // Importance / priority indicator.
  importance?: number
  // Lifecycle state of the ToDo.
  status?: TodoStatus
  // Optional numeric position for manual ordering in UIs.
  order?: number
  // Creation timestamp (ISO-8601).
  createdAt: string
  // Last update timestamp (ISO-8601).
  updatedAt?: string
  // Completion timestamp (ISO-8601), if applicable.
  completedAt?: string
}

// CouchDB document that stores the ToDos for a single Firn user.
export interface TodoDocument extends BaseDocument {
  type: 'todo'
  schema: 1
  // Firn user identifier (FirnUser.firnId) this document belongs to.
  owner: TypedDocumentReference<FirnUser>
  // All ToDos associated with the owner.
  items: TodoItem[]
  // Metadata timestamps for the document as a whole.
  createdAt: string
  updatedAt: string
}
