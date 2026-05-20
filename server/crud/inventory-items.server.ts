/*
 * ItemService - Table of Contents
 * ******************************
 *
 * INTERNAL HELPERS:
 * nowIso() - Generate canonical timestamps
 * isParentEntity(doc) - Type guard for room/equipment/container parents
 * isInventoryItem(doc) - Type guard for inventory items
 * ensureItem(item, itemId) - Require an existing item or throw
 * mergeMetadata(item, updates) - Merge metadata updates while preserving null semantics
 * parseExpiryDate(item) - Extract supported expiry keys from metadata
 * getParent(parentId, parentType) - Resolve and validate parent entity/type match
 * validatePlacement(parent, itemType, position, excludeChildId?) - Enforce acceptance/capacity/grid rules
 * createAction(input) - Persist a lightweight inventory action record
 * updateItemDocument(item, updates) - Build normalized item update payload
 * saveItem(item, rev) - Persist an updated item and refresh revision
 *
 * ITEM CRUD + WORKFLOWS:
 * createItem(input, userId) - Create an item and log creation action
 * getItem(itemId) - Fetch one item by ID
 * getItemsByParent(parentId) - List direct child items of a parent
 * searchItems(query) - Search by id/name/label/description
 * getItemsByStatus(status) - Filter by item status
 * getExpiringItems(beforeDate) - Find items expiring at/before threshold
 * updateItem(itemId, rev, updates, userId) - Update fields and optionally relocate item
 * checkoutItem(itemId, userId) - Mark item in use and create pending return action
 * returnItem(itemId, parentId, parentType, position, userId) - Return item to storage and mark available
 * reserveItem(itemId, userId, description?) - Reserve item for upcoming work
 * unreserveItem(itemId, userId) - Release reservation and restore availability
 * disposeItem(itemId, userId, notes?) - Archive/dispose item and log action
 * moveItem(itemId, newParentId, newParentType, position, userId) - Move item location
 * flagItem(itemId, userId, description) - Attach a notable action/flag entry
 * getItemLocationBreadcrumb(itemId) - Resolve ancestry breadcrumb for display
 */

import { DateTime } from 'luxon'
import { couchDB } from '../database/couchdb'
import {
  buildLocationPath,
  ensureInventoryViews,
  generateInventoryId,
  resolveLocationBreadcrumb,
  validateCapacity,
  validateContainerAcceptance,
  validateGridPosition
} from './inventory-helpers.server'
import type {
  Container,
  CreateInventoryActionInput,
  CreateInventoryItemInput,
  GridPosition,
  InventoryAction,
  InventoryItem,
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

/* Merge metadata patches while preserving `null` for empty metadata. */
function mergeMetadata(
  item: InventoryItem,
  updates: Record<string, unknown>
): InventoryItem['metadata'] {
  const current = item.metadata ?? {}
  const merged = {
    ...current,
    ...updates
  }

  return Object.keys(merged).length > 0 ? merged : null
}

/* Read supported expiry keys from metadata for expiry workflows. */
function parseExpiryDate(item: InventoryItem): string | null {
  const metadata = item.metadata
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const maybeExpiry = (typeof metadata.expiryAt === 'string' && metadata.expiryAt)
    || (typeof metadata.expiresAt === 'string' && metadata.expiresAt)
    || (typeof metadata.expiryDate === 'string' && metadata.expiryDate)

  return maybeExpiry ?? null
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
  itemType: InventoryItem['itemType'],
  position: GridPosition | null,
  excludeChildId?: string
): Promise<void> {
  if (parent.type === 'storageEquipment' || parent.type === 'container') {
    const acceptance = validateContainerAcceptance(parent, 'inventoryItem', itemType)
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

/* Persist a compact inventory action document for item lifecycle auditing. */
async function createAction(input: CreateInventoryActionInput): Promise<InventoryAction> {
  const actionDoc: Omit<InventoryAction, '_id' | '_rev'> = {
    type: 'inventoryAction',
    schema: 1,
    actionId: input.actionId,
    actionType: input.actionType,
    status: input.status ?? 'completed',
    targetId: input.targetId,
    targetType: input.targetType,
    fromParentId: input.fromParentId ?? null,
    fromParentType: input.fromParentType ?? null,
    toParentId: input.toParentId ?? null,
    toParentType: input.toParentType ?? null,
    fromPosition: input.fromPosition ?? null,
    toPosition: input.toPosition ?? null,
    performedBy: input.performedBy,
    performedAt: input.performedAt ?? nowIso(),
    comment: input.comment ?? null,
    details: input.details ?? null
  }

  const created = await couchDB.createDocument(actionDoc)
  const action = await couchDB.getDocument<InventoryAction>(created.id)
  if (!action || action.type !== 'inventoryAction') {
    throw new Error('Failed to create inventory action.')
  }

  return action
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
  /* Create a new item under a valid parent and log a creation action. */
  async createItem(input: CreateInventoryItemInput, userId: string): Promise<InventoryItem> {
    await ensureInventoryViews()

    const parent = await getParent(input.parentId, input.parentType)
    const position = input.position ?? null

    await validatePlacement(parent, input.itemType, position)

    const newItem: Omit<InventoryItem, '_id' | '_rev'> = {
      type: 'inventoryItem',
      schema: 1,
      itemId: input.itemId,
      itemType: input.itemType,
      name: input.name,
      label: input.label,
      description: input.description ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      parentId: parent._id,
      parentType: parent.type,
      locationPath: buildLocationPath(parent),
      position,
      status: input.status ?? 'available',
      metadata: input.metadata ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }

    const created = await couchDB.createDocument(newItem)
    const item = await couchDB.getDocument<InventoryItem>(created.id)

    if (!isInventoryItem(item)) {
      throw new Error('Failed to create inventory item.')
    }

    await createAction({
      actionId: generateInventoryId('item-create-action'),
      actionType: 'create',
      targetId: item._id,
      targetType: 'inventoryItem',
      toParentId: item.parentId,
      toParentType: item.parentType,
      toPosition: item.position,
      performedBy: userId,
      comment: `Created inventory item ${item.itemId}.`
    })

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
      const haystack = [item.itemId, item.name, item.label, item.description ?? '']
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

  /* Find items with parsed expiry dates at or before the threshold. */
  async getExpiringItems(beforeDate: string): Promise<InventoryItem[]> {
    const threshold = new Date(beforeDate)
    if (Number.isNaN(threshold.getTime())) {
      throw new Error('Invalid beforeDate. Expected an ISO date string.')
    }

    const items = await couchDB.queryDocuments<InventoryItem>({
      type: 'inventoryItem'
    })

    return items.filter((item) => {
      const expiry = parseExpiryDate(item)
      if (!expiry) {
        return false
      }

      const expiryDate = new Date(expiry)
      if (Number.isNaN(expiryDate.getTime())) {
        return false
      }

      return expiryDate.getTime() <= threshold.getTime()
    })
  },

  /* Update an item and optionally relocate it with placement validation. */
  async updateItem(itemId: string, rev: string, updates: UpdateInventoryItemInput, userId: string): Promise<InventoryItem> {
    await ensureInventoryViews()

    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    let parentId = item.parentId
    let parentType = item.parentType
    const position = updates.position ?? item.position
    let locationPath = updates.locationPath ?? item.locationPath

    const hasParentChange = updates.parentId != null || updates.parentType != null

    if (hasParentChange) {
      parentId = updates.parentId ?? item.parentId
      parentType = updates.parentType ?? item.parentType
      const parent = await getParent(parentId, parentType)
      await validatePlacement(parent, updates.itemType ?? item.itemType, position, item._id)
      locationPath = buildLocationPath(parent)
    }

    const itemType = updates.itemType ?? item.itemType
    if (!hasParentChange) {
      const currentParent = await getParent(parentId, parentType)
      await validatePlacement(currentParent, itemType, position, item._id)
    }

    const next = updateItemDocument(item, {
      itemId: updates.itemId ?? item.itemId,
      itemType,
      name: updates.name ?? item.name,
      label: updates.label ?? item.label,
      description: updates.description ?? item.description,
      quantity: updates.quantity ?? item.quantity,
      unit: updates.unit ?? item.unit,
      parentId,
      parentType,
      locationPath,
      position,
      status: updates.status ?? item.status,
      metadata: updates.metadata ?? item.metadata
    })

    const saved = await saveItem(next, rev)

    await createAction({
      actionId: generateInventoryId('item-update-action'),
      actionType: 'update',
      targetId: saved._id,
      targetType: 'inventoryItem',
      fromParentId: item.parentId,
      fromParentType: item.parentType,
      toParentId: saved.parentId,
      toParentType: saved.parentType,
      fromPosition: item.position,
      toPosition: saved.position,
      performedBy: userId,
      comment: `Updated inventory item ${saved.itemId}.`
    })

    return saved
  },

  /* Mark item as checked out/in use and create a pending return action. */
  async checkoutItem(itemId: string, userId: string): Promise<{ item: InventoryItem, returnAction: InventoryAction }> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'inUse',
      metadata: mergeMetadata(item, {
        checkedOutBy: userId,
        checkedOutAt: nowIso()
      })
    }), item._rev)

    const returnAction = await createAction({
      actionId: generateInventoryId('item-return-action'),
      actionType: 'update',
      status: 'pending',
      targetId: updatedItem._id,
      targetType: 'inventoryItem',
      fromParentId: updatedItem.parentId,
      fromParentType: updatedItem.parentType,
      toParentId: updatedItem.parentId,
      toParentType: updatedItem.parentType,
      fromPosition: updatedItem.position,
      toPosition: updatedItem.position,
      performedBy: userId,
      comment: `Item ${updatedItem.itemId} checked out; pending return.`,
      details: {
        kind: 'checkout',
        checkedOutBy: userId
      }
    })

    return {
      item: updatedItem,
      returnAction
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

    await validatePlacement(parent, item.itemType, position, item._id)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'available',
      parentId: parent._id,
      parentType: parent.type,
      locationPath: buildLocationPath(parent),
      position,
      metadata: mergeMetadata(item, {
        returnedBy: userId,
        returnedAt: nowIso()
      })
    }), item._rev)

    await createAction({
      actionId: generateInventoryId('item-return-complete-action'),
      actionType: 'update',
      status: 'completed',
      targetId: updatedItem._id,
      targetType: 'inventoryItem',
      fromParentId: item.parentId,
      fromParentType: item.parentType,
      toParentId: updatedItem.parentId,
      toParentType: updatedItem.parentType,
      fromPosition: item.position,
      toPosition: updatedItem.position,
      performedBy: userId,
      comment: `Returned inventory item ${updatedItem.itemId}.`
    })

    return updatedItem
  },

  /* Reserve an item and annotate reservation metadata. */
  async reserveItem(itemId: string, userId: string, description?: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'reserved',
      metadata: mergeMetadata(item, {
        reservedBy: userId,
        reservedAt: nowIso(),
        reservationDescription: description ?? null
      })
    }), item._rev)

    await createAction({
      actionId: generateInventoryId('item-reserve-action'),
      actionType: 'update',
      targetId: updatedItem._id,
      targetType: 'inventoryItem',
      performedBy: userId,
      comment: description ?? `Reserved inventory item ${updatedItem.itemId}.`
    })

    return updatedItem
  },

  /* Clear reservation metadata and restore available status. */
  async unreserveItem(itemId: string, userId: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'available',
      metadata: mergeMetadata(item, {
        unreservedBy: userId,
        unreservedAt: nowIso(),
        reservationDescription: null,
        reservedBy: null,
        reservedAt: null
      })
    }), item._rev)

    await createAction({
      actionId: generateInventoryId('item-unreserve-action'),
      actionType: 'update',
      targetId: updatedItem._id,
      targetType: 'inventoryItem',
      performedBy: userId,
      comment: `Unreserved inventory item ${updatedItem.itemId}.`
    })

    return updatedItem
  },

  /* Archive/dispose an item and record disposal metadata/action. */
  async disposeItem(itemId: string, userId: string, notes?: string): Promise<InventoryItem> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    const updatedItem = await saveItem(updateItemDocument(item, {
      status: 'archived',
      metadata: mergeMetadata(item, {
        disposedBy: userId,
        disposedAt: nowIso(),
        disposalNotes: notes ?? null
      })
    }), item._rev)

    await createAction({
      actionId: generateInventoryId('item-dispose-action'),
      actionType: 'archive',
      targetId: updatedItem._id,
      targetType: 'inventoryItem',
      performedBy: userId,
      comment: notes ?? `Disposed inventory item ${updatedItem.itemId}.`
    })

    return updatedItem
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

    await validatePlacement(newParent, item.itemType, position, item._id)

    const movedItem = await saveItem(updateItemDocument(item, {
      parentId: newParent._id,
      parentType: newParent.type,
      locationPath: buildLocationPath(newParent),
      position
    }), item._rev)

    await createAction({
      actionId: generateInventoryId('item-move-action'),
      actionType: 'move',
      targetId: movedItem._id,
      targetType: 'inventoryItem',
      fromParentId: item.parentId,
      fromParentType: item.parentType,
      toParentId: movedItem.parentId,
      toParentType: movedItem.parentType,
      fromPosition: item.position,
      toPosition: movedItem.position,
      performedBy: userId,
      comment: `Moved inventory item ${movedItem.itemId}.`
    })

    return movedItem
  },

  /* Add a free-form flag action to capture notable handling context. */
  async flagItem(itemId: string, userId: string, description: string): Promise<InventoryAction> {
    const item = ensureItem(await ItemService.getItem(itemId), itemId)

    return await createAction({
      actionId: generateInventoryId('item-flag-action'),
      actionType: 'update',
      targetId: item._id,
      targetType: 'inventoryItem',
      performedBy: userId,
      comment: description,
      details: {
        kind: 'flag',
        description
      }
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
  }
}
