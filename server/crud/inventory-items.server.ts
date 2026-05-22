/*
 * ItemService - Table of Contents
 * ******************************
 *
 * INTERNAL HELPERS:
 * nowIso() - Generate canonical timestamps
 * isParentEntity(doc) - Type guard for room/equipment/container parents
 * isInventoryItem(doc) - Type guard for inventory items
 * ensureItem(item, itemId) - Require an existing item or throw
 * getParent(parentId, parentType) - Resolve and validate parent entity/type match
 * validatePlacement(parent, category, position, excludeChildId?) - Enforce acceptance/capacity/grid rules
 * appendActionLog(item, actionType, userId, opts?) - Append an ActionLogEntry to the item and save
 * updateItemDocument(item, updates) - Build normalized item update payload
 * saveItem(item, rev) - Persist an updated item and refresh revision
 *
 * ITEM CRUD + WORKFLOWS:
 * createItem(input, userId) - Create an item with initial register log entry
 * getItem(itemId) - Fetch one item by ID
 * getItemsByParent(parentId) - List direct child items of a parent
 * searchItems(query) - Search by id/name/label/description/barcode
 * getItemsByStatus(status) - Filter by item status
 * getExpiringItems(beforeDate) - Find items expiring at/before threshold
 * updateItem(itemId, rev, updates, userId) - Update fields and log modify entry
 * checkoutItem(itemId, userId) - Mark item checked out and create planned return task
 * returnItem(itemId, parentId, parentType, position, userId) - Return item to storage and mark available
 * reserveItem(itemId, userId, description?) - Reserve item for upcoming work
 * unreserveItem(itemId, userId) - Release reservation and restore availability
 * disposeItem(itemId, userId, notes?) - Dispose item and log entry
 * moveItem(itemId, newParentId, newParentType, position, userId) - Move item location
 * flagItem(itemId, userId, description) - Append a flag log entry to the item
 * getItemLocationBreadcrumb(itemId) - Resolve ancestry breadcrumb for display
 */

import { DateTime } from 'luxon'
import { couchDB } from '../database/couchdb'
import {
  buildLocationPath,
  ensureInventoryViews,
  resolveLocationBreadcrumb,
  validateCapacity,
  validateContainerAcceptance,
  validateGridPosition
} from './inventory-helpers.server'
import type {
  ActionLogEntry,
  Container,
  CreateInventoryItemInput,
  GridPosition,
  InventoryActionType,
  InventoryItem,
  InventoryTask,
  Room,
  StorageEquipment,
  UpdateInventoryItemInput
} from '../../types/inventory'

type ParentEntity = Room | StorageEquipment | Container

/* Return ISO timestamp with Luxon fallback safety. */
function nowIso(): string {
  return DateTime.now().toISO() ?? new Date().toISOString()
}

/* Check if a fetched document can serve as an inventory parent. */
function isParentEntity(doc: unknown): doc is ParentEntity {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const maybeParent = doc as Partial<ParentEntity>
  return (
    typeof maybeParent._id === 'string'
    && (maybeParent.type === 'room' || maybeParent.type === 'storageEquipment' || maybeParent.type === 'container')
  )
}

/* Check if a fetched document is an inventory item. */
function isInventoryItem(doc: unknown): doc is InventoryItem {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const maybeItem = doc as Partial<InventoryItem>
  return maybeItem.type === 'inventoryItem' && typeof maybeItem.itemId === 'string'
}

/* Ensure an item exists before applying a mutation workflow. */
function ensureItem(item: InventoryItem | null, itemId: string): InventoryItem {
  if (!item) {
    throw new Error(`Inventory item "${itemId}" not found.`)
  }
  return item
}

/* Resolve a parent by ID and ensure the expected parent type matches. */
async function getParent(parentId: string, parentType: InventoryItem['parentType']): Promise<ParentEntity> {
  const parent = await couchDB.getDocument<ParentEntity>(parentId)
  if (!isParentEntity(parent)) {
    throw new Error(`Parent "${parentId}" not found.`)
  }

  if (parent.type !== parentType) {
    throw new Error(`Parent type mismatch. Expected "${parentType}", got "${parent.type}".`)
  }

  return parent
}

/* Validate acceptance/capacity/grid constraints before item placement or movement. */
async function validatePlacement(
  parent: ParentEntity,
  category: InventoryItem['category'],
  position: GridPosition | null,
  excludeChildId?: string
): Promise<void> {
  if (parent.type === 'storageEquipment' || parent.type === 'container') {
    const acceptance = validateContainerAcceptance(parent, 'inventoryItem', category)
    if (!acceptance.valid) {
      throw new Error(acceptance.reason ?? 'Container cannot accept this item type.')
    }

    const hasCapacity = await validateCapacity(parent._id, parent.capacity)
    if (!hasCapacity && !excludeChildId) {
      throw new Error(`Parent "${parent._id}" has reached capacity.`)
    }

    if (position) {
      const rows = parent.rows ?? 0
      const cols = parent.columns ?? 0
      if (rows <= 0 || cols <= 0) {
        throw new Error(`Parent "${parent._id}" does not support grid positioning.`)
      }

      const positionValidation = await validateGridPosition(parent._id, position, rows, cols, excludeChildId)
      if (!positionValidation.valid) {
        throw new Error(positionValidation.reason ?? 'Invalid grid position.')
      }
    }
  }
}

/* Append an ActionLogEntry to the item's embedded actionLog and persist the update. */
async function appendActionLog(
  item: InventoryItem,
  actionType: InventoryActionType,
  userId: string,
  opts?: { notes?: string, fromParentId?: string, toParentId?: string, linkedTaskId?: string }
): Promise<InventoryItem> {
  item.actionLog = item.actionLog || []

  const entry: ActionLogEntry = {
    actionType,
    userId,
    timestamp: new Date().toISOString()
  }

  if (opts?.notes) entry.notes = opts.notes
  if (opts?.fromParentId) entry.fromParentId = opts.fromParentId
  if (opts?.toParentId) entry.toParentId = opts.toParentId
  if (opts?.linkedTaskId) entry.linkedTaskId = opts.linkedTaskId

  item.actionLog.push(entry)
  item.updatedAt = nowIso()

  const result = await couchDB.updateDocument(item._id, item, item._rev)
  return {
    ...item,
    _rev: result.rev
  }
}

/* Build the next item state while preserving invariant fields. */
function updateItemDocument(item: InventoryItem, updates: Partial<InventoryItem>): InventoryItem {
  return {
    ...item,
    ...updates,
    _id: item._id,
    _rev: item._rev,
    type: 'inventoryItem',
    schema: 1,
    updatedAt: nowIso()
  }
}

/* Save an updated item and return the refreshed revision. */
async function saveItem(item: InventoryItem, rev: string): Promise<InventoryItem> {
  const result = await couchDB.updateDocument(item._id, item, rev)
  return {
    ...item,
    _rev: result.rev
  }
}

export const ItemService = {
  /* Create a new item under a valid parent with an initial register log entry. */
  async createItem(input: CreateInventoryItemInput, userId: string): Promise<InventoryItem> {
    await ensureInventoryViews()

    const parent = await getParent(input.parentId, input.parentType)
    const position = input.position ?? null

    await validatePlacement(parent, input.category, position)

    const registerEntry: ActionLogEntry = {
      actionType: 'register',
      userId,
      timestamp: new Date().toISOString(),
      toParentId: parent._id
    }

    const newItem: Omit<InventoryItem, '_id' | '_rev'> = {
      type: 'inventoryItem',
      schema: 1,
      itemId: input.itemId,
      category: input.category,
      classification: input.classification,
      name: input.name,
      label: input.label,
      description: input.description ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      concentration: input.concentration ?? null,
      concentrationUnit: input.concentrationUnit ?? null,
      parentId: parent._id,
      parentType: parent.type,
      locationPath: buildLocationPath(parent),
      position,
      status: input.status ?? 'available',
      expiryDate: input.expiryDate ?? null,
      lotNumber: input.lotNumber ?? null,
      barcode: input.barcode ?? null,
      templateId: input.templateId ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
      projectRefs: input.projectRefs ?? null,
      createdBy: userId,
      actionLog: [registerEntry],
      createdAt: nowIso(),
      updatedAt: nowIso()
    }

    const created = await couchDB.createDocument(newItem)
    const item = await couchDB.getDocument<InventoryItem>(created.id)

    if (!isInventoryItem(item)) {
      throw new Error('Failed to create inventory item.')
    }

    return item
  },

  /* Fetch one inventory item by document ID. */
  async getItem(itemId: string): Promise<InventoryItem | null> {
    const item = await couchDB.getDocument<InventoryItem>(itemId)
    return isInventoryItem(item) ? item : null
  },

  /* List direct child items for one parent document. */
  async getItemsByParent(parentId: string): Promise<InventoryItem[]> {
    return await couchDB.queryDocuments<InventoryItem>({
      type: 'inventoryItem',
      parentId
    })
  },

  /* Search items by ID/name/label/description using in-memory filtering. */
  async searchItems(query: string): Promise<InventoryItem[]> {
    const searchTerm = query.trim().toLowerCase()
    if (!searchTerm) {
      return []
    }

    const items = await couchDB.queryDocuments<InventoryItem>({
      type: 'inventoryItem'
    })

    return items.filter((item) => {
      const haystack = [item.itemId, item.name, item.label, item.description ?? '', item.barcode ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(searchTerm)
    })
  },

  /* Query items by status field. */
  async getItemsByStatus(status: InventoryItem['status']): Promise<InventoryItem[]> {
    return await couchDB.queryDocuments<InventoryItem>({
      type: 'inventoryItem',
      status
    })
  },

  /* Find items with expiry dates at or before the threshold. */
  async getExpiringItems(beforeDate: string): Promise<InventoryItem[]> {
    const threshold = new Date(beforeDate)
    if (Number.isNaN(threshold.getTime())) {
      throw new Error('Invalid beforeDate. Expected an ISO date string.')
    }

    const items = await couchDB.queryDocuments<InventoryItem>({
      type: 'inventoryItem'
    })

    return items.filter((item) => {
      if (!item.expiryDate) {
        return false
      }

      const expiryDate = new Date(item.expiryDate)
      if (Number.isNaN(expiryDate.getTime())) {
        return false
      }

      return expiryDate.getTime() <= threshold.getTime()
    })
  },

  /* Update item fields and log a modify entry. Moving uses the dedicated moveItem() method. */
  async updateItem(itemId: string, rev: string, updates: UpdateInventoryItemInput, userId: string): Promise<InventoryItem> {
    await ensureInventoryViews()

    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const position = updates.position ?? item.position

    const category = updates.category ?? item.category
    const currentParent = await getParent(item.parentId, item.parentType)
    await validatePlacement(currentParent, category, position, item._id)

    const next = updateItemDocument(item, {
      itemId: updates.itemId ?? item.itemId,
      category,
      classification: updates.classification ?? item.classification,
      name: updates.name ?? item.name,
      label: updates.label ?? item.label,
      description: updates.description !== undefined ? updates.description : item.description,
      quantity: updates.quantity !== undefined ? updates.quantity : item.quantity,
      unit: updates.unit !== undefined ? updates.unit : item.unit,
      concentration: updates.concentration !== undefined ? updates.concentration : item.concentration,
      concentrationUnit: updates.concentrationUnit !== undefined ? updates.concentrationUnit : item.concentrationUnit,
      position,
      status: updates.status ?? item.status,
      expiryDate: updates.expiryDate !== undefined ? updates.expiryDate : item.expiryDate,
      lotNumber: updates.lotNumber !== undefined ? updates.lotNumber : item.lotNumber,
      barcode: updates.barcode !== undefined ? updates.barcode : item.barcode,
      templateId: updates.templateId !== undefined ? updates.templateId : item.templateId,
      notes: updates.notes !== undefined ? updates.notes : item.notes,
      metadata: updates.metadata !== undefined ? updates.metadata : item.metadata,
      projectRefs: updates.projectRefs !== undefined ? updates.projectRefs : item.projectRefs
    })

    const saved = await saveItem(next, rev)

    return await appendActionLog(saved, 'modify', userId)
  },

  /* Mark item as checked out, log the event, and create a planned return task. */
  async checkoutItem(itemId: string, userId: string): Promise<{ item: InventoryItem, returnTask: InventoryTask }> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'checked_out'
    }), item._rev)

    const loggedItem = await appendActionLog(updatedItem, 'checkout', userId, {
      fromParentId: updatedItem.parentId
    })

    const { TaskService } = await import('./inventory-tasks.server')

    const returnTask = await TaskService.createTask({
      actionType: 'return',
      status: 'planned',
      targetId: loggedItem._id,
      targetType: 'inventoryItem',
      toParentId: loggedItem.parentId,
      toParentType: loggedItem.parentType,
      toPosition: loggedItem.position,
      description: `Item ${loggedItem.itemId} checked out; pending return.`
    }, userId)

    return {
      item: loggedItem,
      returnTask
    }
  },

  /* Return a checked-out item to storage and mark it available. */
  async returnItem(
    itemId: string,
    parentId: string,
    parentType: InventoryItem['parentType'],
    position: GridPosition | null,
    userId: string
  ): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)
    const parent = await getParent(parentId, parentType)

    await validatePlacement(parent, item.category, position, item._id)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'available',
      parentId: parent._id,
      parentType: parent.type,
      locationPath: buildLocationPath(parent),
      position
    }), item._rev)

    return await appendActionLog(updatedItem, 'return', userId, {
      fromParentId: item.parentId,
      toParentId: updatedItem.parentId
    })
  },

  /* Reserve an item for upcoming work. */
  async reserveItem(itemId: string, userId: string, description?: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'reserved'
    }), item._rev)

    return await appendActionLog(updatedItem, 'reserve', userId, {
      notes: description
    })
  },

  /* Release reservation and restore available status. */
  async unreserveItem(itemId: string, userId: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'available'
    }), item._rev)

    return await appendActionLog(updatedItem, 'unreserve', userId)
  },

  /* Dispose an item, skip pending tasks, and record disposal action. */
  async disposeItem(itemId: string, userId: string, notes?: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'disposed'
    }), item._rev)

    // Skip any pending tasks (return reminders, expiry tasks) for this item
    const { TaskService } = await import('./inventory-tasks.server')
    await TaskService.skipTasksForTarget(item._id, `Item disposed by ${userId}`)

    return await appendActionLog(updatedItem, 'dispose', userId, {
      notes: notes
    })
  },

  /* Move an item to a new parent/position with validation and action logging. */
  async moveItem(
    itemId: string,
    newParentId: string,
    newParentType: InventoryItem['parentType'],
    position: GridPosition | null,
    userId: string
  ): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)
    const newParent = await getParent(newParentId, newParentType)

    await validatePlacement(newParent, item.category, position, item._id)

    const movedItem = await saveItem(updateItemDocument(item, {
      parentId: newParent._id,
      parentType: newParent.type,
      locationPath: buildLocationPath(newParent),
      position
    }), item._rev)

    return await appendActionLog(movedItem, 'move', userId, {
      fromParentId: item.parentId,
      toParentId: movedItem.parentId
    })
  },

  /* Append a flag log entry to capture notable handling context. */
  async flagItem(itemId: string, userId: string, description: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    return await appendActionLog(item, 'flag', userId, {
      notes: description
    })
  },

  /* Resolve a simplified breadcrumb for human-readable location display. */
  async getItemLocationBreadcrumb(itemId: string): Promise<Array<{ id: string, type: string, name: string }>> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)
    const breadcrumb = await resolveLocationBreadcrumb(item.locationPath, item.parentId)

    return breadcrumb.map(entry => ({
      id: entry.id,
      type: entry.type,
      name: entry.name
    }))
  },

  /* Permanently delete an item document from the database. Admin-only operation. */
  async deleteItem(itemId: string, rev: string): Promise<void> {
    await couchDB.deleteDocument(itemId, rev)
  }
}
