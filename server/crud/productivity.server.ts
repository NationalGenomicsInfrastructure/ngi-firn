/*
 * ProductivityService - Table of Contents
 * ****************************************
 *
 * TODO DOCUMENTS (in firn database):
 * createTodoDocument(input) - Create a new TodoDocument with owners, title, optional description
 * getTodoDocument(docId) - Get a TodoDocument by _id
 * getTodosFromDocument(docId) - Get TodoItem[] from a TodoDocument by _id
 * deleteTodoDocument(doc) - Delete a TodoDocument
 *
 * TODO ITEMS (within a TodoDocument):
 * createTodoItem(doc, itemInput) - Add a TodoItem to a TodoDocument
 * updateTodoItem(doc, itemId, updates) - Update a TodoItem by id within a TodoDocument
 * deleteTodoItem(doc, itemId) - Remove a TodoItem by id from a TodoDocument
 */

import { DateTime } from 'luxon'

import { couchDB } from '../database/couchdb'
import type { TodoDocument, TodoItem, TodoStatus } from '../../types/productivity'
import type { TypedDocumentReference } from '../../types/references'
import type { FirnUser } from '../../types/auth'

/** Input to create a new TodoDocument (owners and title required). */
export interface CreateTodoDocumentInput {
  owners: TypedDocumentReference<FirnUser>[]
  viewers?: TypedDocumentReference<FirnUser>[]
  title: string
  description?: string
}

/** Input to create a new TodoItem (id and timestamps are set by the service). */
export interface CreateTodoItemInput {
  title: string
  body?: string
  tags?: string[]
  dueDate?: string
  importance?: number
  status?: TodoStatus
  order?: number
}

function generateTodoItemId(): string {
  return `todo_${DateTime.now().toMillis()}_${Math.random().toString(36).slice(2, 10)}`
}

export const ProductivityService = {
  // -------------------------------------------------------------------------
  // TodoDocument CRUD
  // -------------------------------------------------------------------------

  /**
   * Create a new TodoDocument in the firn database.
   * Initial items array is empty.
   */
  async createTodoDocument(input: CreateTodoDocumentInput): Promise<TodoDocument | null> {
    const now = DateTime.now().toISO()
    const newDoc: Omit<TodoDocument, '_id' | '_rev'> = {
      type: 'todo_collection',
      schema: 1,
      owners: input.owners,
      viewers: input.viewers ?? [],
      title: input.title,
      description: input.description,
      items: [],
      createdAt: now,
      updatedAt: now
    }
    const result = await couchDB.createDocument(newDoc)
    const created = await couchDB.getDocument<TodoDocument>(result.id)
    return created
  },

  /**
   * Get a TodoDocument by its CouchDB _id.
   */
  async getTodoDocument(docId: string): Promise<TodoDocument | null> {
    const doc = await couchDB.getDocument<TodoDocument>(docId)
    if (!doc || doc.type !== 'todo_collection')
      return null
    return doc as TodoDocument
  },

  /**
   * Get all TodoItems from a TodoDocument by document _id.
   */
  async getTodosFromDocument(docId: string): Promise<TodoItem[]> {
    const doc = await ProductivityService.getTodoDocument(docId)
    if (!doc)
      return []
    return doc.items ?? []
  },

  /**
   * Delete a TodoDocument. Pass the document (must have _id and _rev).
   */
  async deleteTodoDocument(doc: TodoDocument): Promise<void> {
    if (!doc._id || !doc._rev)
      throw new Error('TodoDocument must have _id and _rev to delete')
    await couchDB.deleteDocument(doc._id, doc._rev)
  },

  // -------------------------------------------------------------------------
  // TodoItem CRUD (within a TodoDocument)
  // -------------------------------------------------------------------------

  /**
   * Add a TodoItem to a TodoDocument. Generates id and sets createdAt/updatedAt.
   */
  async createTodoItem(doc: TodoDocument, itemInput: CreateTodoItemInput): Promise<TodoDocument | null> {
    if (!doc._id || !doc._rev)
      return null
    const now = DateTime.now().toISO()
    const newItem: TodoItem = {
      id: generateTodoItemId(),
      title: itemInput.title,
      body: itemInput.body,
      tags: itemInput.tags,
      dueDate: itemInput.dueDate,
      importance: itemInput.importance,
      status: itemInput.status ?? 'pending',
      order: itemInput.order,
      createdAt: now,
      updatedAt: now
    }
    const items = [...(doc.items ?? []), newItem]
    const updated: TodoDocument = {
      ...doc,
      items,
      updatedAt: now
    }
    const result = await couchDB.updateDocument(doc._id, updated, doc._rev)
    return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
  },

  /**
   * Update a TodoItem by id within a TodoDocument. Merges partial updates and sets updatedAt.
   */
  async updateTodoItem(
    doc: TodoDocument,
    itemId: string,
    updates: Partial<Omit<TodoItem, 'id' | 'createdAt'>>
  ): Promise<TodoDocument | null> {
    if (!doc._id || !doc._rev)
      return null
    const items = doc.items ?? []
    const index = items.findIndex(i => i.id === itemId)
    const existing = index >= 0 ? items[index] : undefined
    if (!existing)
      return null
    const now = DateTime.now().toISO()
    const updatedItem: TodoItem = {
      ...existing,
      ...updates,
      id: existing.id,
      title: updates.title ?? existing.title,
      createdAt: existing.createdAt,
      updatedAt: now
    }
    const newItems = [...items]
    newItems[index] = updatedItem
    const updated: TodoDocument = {
      ...doc,
      items: newItems,
      updatedAt: now
    }
    const result = await couchDB.updateDocument(doc._id, updated, doc._rev)
    return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
  },

  /**
   * Remove a TodoItem by id from a TodoDocument.
   */
  async deleteTodoItem(doc: TodoDocument, itemId: string): Promise<TodoDocument | null> {
    if (!doc._id || !doc._rev)
      return null
    const items = (doc.items ?? []).filter(i => i.id !== itemId)
    if (items.length === (doc.items ?? []).length)
      return null
    const now = DateTime.now().toISO()
    const updated: TodoDocument = {
      ...doc,
      items,
      updatedAt: now
    }
    const result = await couchDB.updateDocument(doc._id, updated, doc._rev)
    return { ...updated, _id: result.id, _rev: result.rev } as TodoDocument
  }
}
