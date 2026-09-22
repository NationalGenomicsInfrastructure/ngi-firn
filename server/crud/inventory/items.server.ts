import { couchDB, generateCouchDocId, generateSlug } from '../../database/couchdb'
import { ContainerService, type ResolvedParent } from './containers.server'
import { EquipmentService } from './equipment.server'
import { deriveGridLabel, findFirstFreeGridSlot, isSlotOccupied, isWithinGrid, totalSlots } from './grid.server'
import {
  buildAlterActionNotes,
  createInventoryChangeRecords,
  createModifyActionLogEntry,
  statusFromAction
} from './logging.server'
import { ProjectService } from '../projects.server'
import { resolveActionLogUsers, toParentRef, toUserRef } from './relations.server'
import type {
  Container,
  DisplayInventoryActionLogEntry,
  DisplayInventoryItem,
  GridPosition,
  InventoryActiveFlag,
  InventoryItem,
  ItemMoveTarget,
  InventoryProjectRef,
  SerializedEntityRef,
  StorageEquipment
} from '../../../types/inventory'
import type { FirnUser } from '../../../types/auth'
import type {
  AlterItemSchemaInput,
  CreateItemSchemaInput,
  DeleteItemSchemaInput,
  ItemParentKind,
  ItemType,
  LocateItemSchemaInput,
  MoveItemSchemaInput,
  UpdateItemSchemaInput
} from '~~/schemas/inventory/items'
import type { InventoryActionType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import { allowedActionsForStatus, isAlterAction, isVacatingAction } from '~~/schemas/inventory/metadata'

/*
 * ItemService - Table of Contents
 * ********************************
 *
 * TYPE GUARDS AND RETRIEVAL:
 * isInventoryItem(doc) - Check whether a fetched document is an InventoryItem
 * getItem(id) - Fetch one item document by ID
 * getItemBySlug(slug) - Fetch one item document by slug
 * getItemsByParent(parentDocumentId, parentKind) - List direct item children of a parent
 * getAllItems() - List all inventory items
 *
 * PARENT PLACEMENT AND CAPACITY:
 * resolveItemParent(slug, kind) - Resolve an equipment/container parent
 * resolveItemPlacement(parent, position, category) - Validate or allocate a parent grid slot
 * adjustParentOccupancy(...) - Reserve or release a resolved parent's item capacity
 * adjustParentRefOccupancy(...) - Reserve or release a stored parent reference's capacity
 * assertBatchCapacityAvailable(parent, items) - Validate a shared destination for a batch
 * getMoveTargetsForItem(slug) - List parents that can accept one item
 * getMoveTargetsForItems(slugs) - List parents that can accept an item batch
 *
 * CREATE, UPDATE, DELETE, AND MOVE:
 * createItem(input, firnUser) - Register an item and reserve parent capacity
 * updateItem(updates, firnUser) - Update item metadata and append field changes to its audit log
 * deleteItem(input) - Delete items and release each parent's capacity
 * moveItem(input, firnUser) - Re-home one or more items in a strict-atomic batch
 * locateItem(input, firnUser) - Re-place lost items and restore available status
 * alterItem(input, firnUser) - Apply lifecycle actions, flags, and audit entries
 *
 * PROJECT REFERENCES AND DISPLAY:
 * addProjectRef(slug, projectId) - Link a LIMS project to an item
 * removeProjectRef(slug, projectId) - Remove a LIMS project link
 * convertToDisplayItem(item, parent, recentActionLog) - Build a client-safe projection
 * convertMultipleToDisplayItems(items) - Batch-convert items with parents and audit users
 * getItemActionLog(slug) - Retrieve the full enriched audit history
 * getItemProjectRefs(slug) - Retrieve full referenced-project details
 */

export type DeleteItemResult = {
  deleted: InventoryItem[]
  failures: { slug: string, error: string }[]
}

const RECENT_LOG_ENTRIES = 10

/* Log a failed compensating operation without hiding the original write failure. */
function logRollbackFailure(operation: string, error: unknown): void {
  console.error(`Failed to roll back item ${operation}:`, error)
}

/* Check whether a fetched CouchDB document is an inventory item. */
function isInventoryItem(doc: unknown): doc is InventoryItem {
  return !!doc
    && typeof doc === 'object'
    && (doc as Partial<InventoryItem>).type === 'inventoryItem'
}

/* Query item documents by [type, slug] using the inventory view index. */
async function queryItemsBySlug(slug: string): Promise<InventoryItem[]> {
  const result = await couchDB.queryView<[string, string], null, InventoryItem>(
    'firn-inventory',
    'by_slug',
    { key: ['inventoryItem', slug], include_docs: true, reduce: false }
  )
  return result.rows.map(row => row.doc).filter((doc): doc is InventoryItem => isInventoryItem(doc))
}

/* Resolve the direct equipment/container parent selected by public slug. */
async function resolveItemParent(parentSlug: string, parentKind: ItemParentKind): Promise<ResolvedParent> {
  return ContainerService.resolveParent(parentSlug, parentKind)
}

/*
 * Validate a container parent's item acceptance and determine the item's placement.
 * Equipment currently has no item-capacity model, so direct equipment items are unpositioned.
 */
async function resolveItemPlacement(
  parent: ResolvedParent,
  proposedPosition: GridPosition | null | undefined,
  category: ItemType
): Promise<GridPosition | null> {
  if (parent.kind === 'equipment') {
    return null
  }

  const entry = parent.doc.capacity?.find(
    capacityEntry => capacityEntry.childKind === 'item' && capacityEntry.type === category
  )
  if (!entry) {
    throw new Error(`Container "${parent.doc.slug}" does not accept items of type "${category}".`)
  }
  if (entry.layout !== 'grid') {
    return null
  }

  const dimensions = { rows: entry.rows, columns: entry.columns, levels: entry.levels ?? 1 }
  if (proposedPosition) {
    if (!isWithinGrid(proposedPosition, dimensions)) {
      throw new Error(
        `Position (row ${proposedPosition.row}, column ${proposedPosition.column}, level ${proposedPosition.level ?? 1}) is outside the ${entry.rows}x${entry.columns}x${entry.levels ?? 1} grid of "${parent.doc.slug}".`
      )
    }
    if (await isSlotOccupied(parent.doc._id, proposedPosition)) {
      throw new Error(
        `Slot (row ${proposedPosition.row}, column ${proposedPosition.column}, level ${proposedPosition.level ?? 1}) in "${parent.doc.slug}" is already occupied.`
      )
    }
    return {
      row: proposedPosition.row,
      column: proposedPosition.column,
      level: proposedPosition.level,
      label: proposedPosition.label ?? deriveGridLabel(proposedPosition.row, proposedPosition.column, proposedPosition.level)
    }
  }

  const position = await findFirstFreeGridSlot(parent.doc._id, entry)
  if (!position) {
    throw new Error(`Grid container "${parent.doc.slug}" is full; no free slot for an item of type "${category}".`)
  }
  return position
}

/*
 * Change capacity on a resolved parent. Count containers track per category; grid
 * containers track occupied positions. Equipment intentionally does not track items.
 */
async function adjustParentOccupancy(
  parent: ResolvedParent,
  category: ItemType,
  position: GridPosition | null,
  delta: number
): Promise<void> {
  if (parent.kind === 'equipment') {
    return
  }
  if (position) {
    await ContainerService.adjustOccupancy(parent.doc._id, position, delta)
    return
  }
  await ContainerService.adjustStoredCount(parent.doc._id, category, delta)
}

/* Apply capacity changes when only a stored item parent reference is available. */
async function adjustParentRefOccupancy(
  parentRef: InventoryItem['parent'],
  position: GridPosition | null | undefined,
  category: ItemType,
  delta: number
): Promise<void> {
  if (!parentRef || parentRef.type === 'storageEquipment') {
    return
  }
  if (position) {
    await ContainerService.adjustOccupancy(parentRef.id, position, delta)
    return
  }
  await ContainerService.adjustStoredCount(parentRef.id, category, delta)
}

/* Ensure a shared container destination can accept every item before a batch move begins. */
function assertBatchCapacityAvailable(parent: ResolvedParent, items: InventoryItem[]): void {
  if (parent.kind === 'equipment') {
    return
  }

  const neededByType = new Map<string, number>()
  for (const item of items) {
    neededByType.set(item.category, (neededByType.get(item.category) ?? 0) + 1)
  }

  const capacity = parent.doc.capacity ?? []
  const gridEntry = capacity.find(entry => entry.layout === 'grid')
  if (gridEntry?.layout === 'grid') {
    let totalNeeded = 0
    for (const [type, count] of neededByType) {
      if (gridEntry.childKind !== 'item' || gridEntry.type !== type) {
        throw new Error(`Container "${parent.doc.slug}" does not accept items of type "${type}".`)
      }
      totalNeeded += count
    }
    const available = totalSlots(gridEntry) - gridEntry.stored
    if (available < totalNeeded) {
      throw new Error(`Grid container "${parent.doc.slug}" has only ${available} free slot(s); ${totalNeeded} requested.`)
    }
    return
  }

  for (const [type, count] of neededByType) {
    const entry = capacity.find(
      capacityEntry => capacityEntry.layout === 'count'
        && capacityEntry.childKind === 'item'
        && capacityEntry.type === type
    )
    if (!entry || entry.layout !== 'count') {
      throw new Error(`Container "${parent.doc.slug}" does not accept items of type "${type}".`)
    }
    const available = entry.capacity - entry.stored
    if (available < count) {
      throw new Error(`Container "${parent.doc.slug}" has room for ${available} more items of type "${type}"; ${count} requested.`)
    }
  }
}

/*
 * Move one item using destination reservation → item write → source release ordering.
 * Compensating writes preserve capacity consistency when a later step fails.
 */
async function moveItemOne(
  existing: InventoryItem,
  newParent: ResolvedParent,
  requestedPosition: GridPosition | null,
  firnUser: FirnUser,
  logComment: string | null | undefined,
  options: { actionType?: InventoryActionType, newStatus?: InventoryStatusType } = {}
): Promise<InventoryItem> {
  const position = await resolveItemPlacement(newParent, requestedPosition, existing.category)
  await adjustParentOccupancy(newParent, existing.category, position, 1)

  const now = new Date().toISOString()
  const actionType = options.actionType ?? 'move'
  const moved: InventoryItem = {
    ...existing,
    parent: toParentRef(newParent.doc),
    position,
    ...(options.newStatus && { status: options.newStatus }),
    updatedAt: now
  }
  const placement = position
    ? ` in position ${position.label ?? deriveGridLabel(position.row, position.column, position.level)}`
    : ''
  moved.actionLog = [
    ...existing.actionLog,
    {
      actionType,
      firnUser: toUserRef(firnUser),
      timestamp: now,
      notes: logComment ?? (actionType === 'locate'
        ? `Located and returned to storage in parent "${newParent.doc.name}"${placement}.`
        : `Moved to parent "${newParent.doc.name}"${placement}.`)
    }
  ]

  try {
    const result = await couchDB.updateDocument(moved._id, moved, existing._rev)
    moved._rev = result.rev
  }
  catch (error) {
    try {
      await adjustParentOccupancy(newParent, existing.category, position, -1)
    }
    catch (rollbackError) {
      logRollbackFailure('destination reservation after a failed item write', rollbackError)
    }
    throw error
  }

  try {
    await adjustParentRefOccupancy(existing.parent, existing.position, existing.category, -1)
  }
  catch (error) {
    try {
      await couchDB.updateDocument(existing._id, existing, moved._rev)
    }
    catch (rollbackError) {
      logRollbackFailure('item document after a failed source release', rollbackError)
    }
    try {
      await adjustParentOccupancy(newParent, existing.category, position, -1)
    }
    catch (rollbackError) {
      logRollbackFailure('destination reservation after a failed source release', rollbackError)
    }
    throw error
  }

  return moved
}

/* Reverse a fully committed item move while rolling back a failed batch. */
async function rollbackItemMove(
  before: InventoryItem,
  after: InventoryItem,
  newParent: ResolvedParent
): Promise<void> {
  await adjustParentRefOccupancy(before.parent, before.position, before.category, 1)
  const restored: InventoryItem = {
    ...after,
    parent: before.parent,
    position: before.position,
    status: before.status,
    actionLog: before.actionLog,
    updatedAt: new Date().toISOString()
  }
  const result = await couchDB.updateDocument(restored._id, restored, after._rev)
  restored._rev = result.rev
  await adjustParentOccupancy(newParent, before.category, after.position, -1)
}

export const ItemService = {
  /* Fetch one item document by CouchDB ID. */
  async getItem(itemDocumentId: string): Promise<InventoryItem | null> {
    const item = await couchDB.getDocument<InventoryItem>(itemDocumentId)
    return isInventoryItem(item) ? item : null
  },

  /* Fetch one item document by stable public slug. */
  async getItemBySlug(slug: string): Promise<InventoryItem | null> {
    return (await queryItemsBySlug(slug))[0] ?? null
  },

  /* List direct item children of one equipment or container parent. */
  async getItemsByParent(parentDocumentId: string, parentKind: ItemParentKind): Promise<InventoryItem[]> {
    const parentType = parentKind === 'equipment' ? 'storageEquipment' : 'container'
    const result = await couchDB.queryView<[string, string], null, InventoryItem>(
      'firn-inventory',
      'by_parent',
      { key: [parentType, parentDocumentId], include_docs: true, reduce: false }
    )
    return result.rows
      .map(row => row.doc)
      .filter((doc): doc is InventoryItem => isInventoryItem(doc))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  /* List every inventory item, sorted by name. */
  async getAllItems(): Promise<InventoryItem[]> {
    const result = await couchDB.queryView<string, null, InventoryItem>(
      'firn-inventory',
      'by_type',
      { key: 'inventoryItem', include_docs: true, reduce: false }
    )
    return result.rows
      .map(row => row.doc)
      .filter((doc): doc is InventoryItem => isInventoryItem(doc))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  /* List valid equipment/container destinations for one item, excluding its current parent. */
  async getMoveTargetsForItem(itemSlug: string): Promise<ItemMoveTarget[]> {
    return this.getMoveTargetsForItems([itemSlug])
  },

  /*
   * List valid shared destinations for an item batch. Active equipment is unbounded for
   * items; containers must accept every requested category with enough remaining capacity.
   */
  async getMoveTargetsForItems(itemSlugs: string[]): Promise<ItemMoveTarget[]> {
    const items: InventoryItem[] = []
    for (const slug of itemSlugs) {
      const item = await this.getItemBySlug(slug)
      if (!item) {
        throw new Error(`Item with identifier "${slug}" not found.`)
      }
      items.push(item)
    }

    const excludedParentIds = new Set(
      items.map(item => item.parent?.id).filter((id): id is string => !!id)
    )
    const neededByCategory = new Map<string, number>()
    for (const item of items) {
      neededByCategory.set(item.category, (neededByCategory.get(item.category) ?? 0) + 1)
    }

    const targets = new Map<string, ItemMoveTarget>()
    const equipment = await EquipmentService.getAllEquipment()
    for (const parent of equipment) {
      if (parent.isActive && !excludedParentIds.has(parent._id)) {
        targets.set(parent.slug, {
          slug: parent.slug,
          name: parent.name,
          kind: 'equipment',
          free: null
        })
      }
    }

    const categories = [...neededByCategory.keys()]
    if (categories.length === 0) {
      return [...targets.values()].sort((a, b) => a.name.localeCompare(b.name))
    }

    const candidatesByCategory = new Map<string, Map<string, { doc: Container, free: number }>>()
    for (const category of categories) {
      const result = await couchDB.queryView<[string, string], { free: number }, Container>(
        'firn-inventory',
        'capacity_by_accepted_category',
        {
          key: ['item', category],
          include_docs: true,
          reduce: false
        }
      )
      const candidates = new Map<string, { doc: Container, free: number }>()
      for (const row of result.rows) {
        const container = row.doc
        if (!container || container.type !== 'container' || excludedParentIds.has(container._id)) continue
        const free = row.value?.free ?? 0
        if (!candidates.has(container.slug)) {
          candidates.set(container.slug, { doc: container, free })
        }
      }
      candidatesByCategory.set(category, candidates)
    }

    const firstCategory = categories[0]
    const firstCandidates = firstCategory ? candidatesByCategory.get(firstCategory) : undefined
    for (const [slug, candidate] of firstCandidates ?? []) {
      let fits = true
      let minimumFree = Number.POSITIVE_INFINITY
      for (const category of categories) {
        const match = candidatesByCategory.get(category)?.get(slug)
        const needed = neededByCategory.get(category) ?? 0
        if (!match || match.free < needed) {
          fits = false
          break
        }
        minimumFree = Math.min(minimumFree, match.free)
      }
      if (fits) {
        targets.set(slug, {
          slug,
          name: candidate.doc.name,
          kind: 'container',
          free: Number.isFinite(minimumFree) ? minimumFree : 0
        })
      }
    }

    return [...targets.values()].sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Register an item after reserving its parent's capacity or grid slot. */
  async createItem(input: CreateItemSchemaInput, firnUser: FirnUser): Promise<InventoryItem> {
    const parent = await resolveItemParent(input.parentSlug, input.parentKind)
    const position = await resolveItemPlacement(parent, input.position ?? null, input.category)
    await adjustParentOccupancy(parent, input.category, position, 1)

    const now = new Date().toISOString()
    const projectRefsEntries = input.projectIds && input.projectIds.length > 0
      ? (await Promise.all(input.projectIds.map(projectId => ProjectService.buildProjectDocumentRef(projectId))))
          .filter((entry): entry is NonNullable<Awaited<ReturnType<typeof ProjectService.buildProjectDocumentRef>>> => entry !== null)
      : []
    const projectRefs = projectRefsEntries.length > 0
      ? Object.fromEntries(projectRefsEntries.map(({ key, ref }) => [key, ref]))
      : null
    const document: Omit<InventoryItem, '_id' | '_rev'> = {
      type: 'inventoryItem',
      schema: 1,
      parent: toParentRef(parent.doc),
      slug: generateSlug(input.name),
      category: input.category,
      classification: input.classification ?? null,
      name: input.name,
      label: input.label?.trim() || null,
      description: input.description ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit?.trim() || null,
      concentration: input.concentration ?? null,
      concentrationUnit: input.concentrationUnit?.trim() || null,
      position,
      arrivalDate: input.arrivalDate ?? null,
      openingDate: input.openingDate ?? null,
      expiryDate: input.expiryDate ?? null,
      lotNumber: input.lotNumber?.trim() || null,
      barcode: input.barcode?.trim() || null,
      templateId: input.templateId ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
      projectRefs,
      status: 'available',
      actionLog: [{
        actionType: 'register',
        firnUser: toUserRef(firnUser),
        timestamp: now,
        notes: `Created in parent "${parent.doc.name}".`
      }],
      activeFlags: [],
      createdAt: now,
      updatedAt: now
    }

    try {
      const created = await couchDB.createDocument({ ...document, _id: generateCouchDocId('item') })
      const item = await ItemService.getItem(created.id)
      if (!item) {
        throw new Error('Failed to load inventory item after creation.')
      }
      return item
    }
    catch (error) {
      try {
        await adjustParentOccupancy(parent, input.category, position, -1)
      }
      catch (rollbackError) {
        logRollbackFailure('parent reservation after a failed item creation', rollbackError)
      }
      throw error
    }
  },

  /* Update metadata only; moving an item belongs to the dedicated move workflow. */
  async updateItem(updates: UpdateItemSchemaInput, firnUser: FirnUser): Promise<InventoryItem> {
    const existing = await ItemService.getItemBySlug(updates.itemSlug)
    if (!existing) {
      throw new Error(`Item with identifier "${updates.itemSlug}" not found.`)
    }

    const updated: InventoryItem = {
      ...existing,
      classification: updates.classification === undefined ? existing.classification : updates.classification ?? null,
      name: updates.name ?? existing.name,
      label: updates.label === undefined ? existing.label : (updates.label?.trim() || null),
      description: updates.description === undefined ? existing.description : updates.description ?? null,
      quantity: updates.quantity === undefined ? existing.quantity : updates.quantity ?? null,
      unit: updates.unit === undefined ? existing.unit : (updates.unit?.trim() || null),
      concentration: updates.concentration === undefined ? existing.concentration : updates.concentration ?? null,
      concentrationUnit: updates.concentrationUnit === undefined
        ? existing.concentrationUnit
        : updates.concentrationUnit?.trim() || null,
      arrivalDate: updates.arrivalDate === undefined ? existing.arrivalDate : updates.arrivalDate ?? null,
      openingDate: updates.openingDate === undefined ? existing.openingDate : updates.openingDate ?? null,
      expiryDate: updates.expiryDate === undefined ? existing.expiryDate : updates.expiryDate ?? null,
      lotNumber: updates.lotNumber === undefined ? existing.lotNumber : updates.lotNumber?.trim() || null,
      barcode: updates.barcode === undefined ? existing.barcode : updates.barcode?.trim() || null,
      templateId: updates.templateId === undefined ? existing.templateId : updates.templateId ?? null,
      notes: updates.notes === undefined ? existing.notes : updates.notes ?? null,
      metadata: updates.metadata === undefined ? existing.metadata : updates.metadata ?? null,
      slug: updates.name && updates.name !== existing.name ? generateSlug(updates.name) : existing.slug,
      updatedAt: new Date().toISOString()
    }
    const changelogEntry = createModifyActionLogEntry({
      firnUser,
      timestamp: updated.updatedAt,
      notes: updates.logComment ?? `Modified inventory item "${updated.name}".`,
      trackedFields: [
        { field: 'classification', before: existing.classification, after: updated.classification },
        { field: 'name', before: existing.name, after: updated.name },
        { field: 'slug', before: existing.slug, after: updated.slug },
        { field: 'label', before: existing.label, after: updated.label },
        { field: 'description', before: existing.description, after: updated.description },
        { field: 'quantity', before: existing.quantity, after: updated.quantity },
        { field: 'unit', before: existing.unit, after: updated.unit },
        { field: 'concentration', before: existing.concentration, after: updated.concentration },
        { field: 'concentrationUnit', before: existing.concentrationUnit, after: updated.concentrationUnit },
        { field: 'arrivalDate', before: existing.arrivalDate, after: updated.arrivalDate },
        { field: 'openingDate', before: existing.openingDate, after: updated.openingDate },
        { field: 'expiryDate', before: existing.expiryDate, after: updated.expiryDate },
        { field: 'lotNumber', before: existing.lotNumber, after: updated.lotNumber },
        { field: 'barcode', before: existing.barcode, after: updated.barcode },
        { field: 'templateId', before: existing.templateId, after: updated.templateId },
        { field: 'notes', before: existing.notes, after: updated.notes },
        { field: 'metadata', before: existing.metadata, after: updated.metadata }
      ]
    })
    updated.actionLog = changelogEntry ? [...existing.actionLog, changelogEntry] : existing.actionLog

    const result = await couchDB.updateDocument(updated._id, updated, existing._rev)
    updated._rev = result.rev
    return updated
  },

  /* Delete items independently and free their former parent capacity afterward. */
  async deleteItem(input: DeleteItemSchemaInput): Promise<DeleteItemResult> {
    const deleted: InventoryItem[] = []
    const failures: { slug: string, error: string }[] = []
    for (const slug of input.itemSlug) {
      try {
        const existing = await ItemService.getItemBySlug(slug)
        if (!existing) {
          throw new Error(`Item with identifier "${slug}" not found.`)
        }
        await couchDB.deleteDocument(existing._id, existing._rev)
        await adjustParentRefOccupancy(existing.parent, existing.position, existing.category, -1)
        deleted.push(existing)
      }
      catch (error) {
        failures.push({ slug, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return { deleted, failures }
  },

  /* Move one or more items to one shared parent, rolling back completed moves on failure. */
  async moveItem(input: MoveItemSchemaInput, firnUser: FirnUser): Promise<InventoryItem[]> {
    const newParent = await resolveItemParent(input.newParentSlug, input.newParentKind)
    const items: InventoryItem[] = []
    for (const slug of input.itemSlug) {
      const item = await ItemService.getItemBySlug(slug)
      if (!item) {
        throw new Error(`Item with identifier "${slug}" not found.`)
      }
      if (item.parent?.id === newParent.doc._id) {
        throw new Error(`Item "${slug}" is already stored in the selected parent.`)
      }
      items.push(item)
    }
    assertBatchCapacityAvailable(newParent, items)

    const moved: { before: InventoryItem, after: InventoryItem }[] = []
    try {
      for (const item of items) {
        const after = await moveItemOne(item, newParent, items.length === 1 ? input.position ?? null : null, firnUser, input.logComment)
        moved.push({ before: item, after })
      }
    }
    catch (error) {
      for (const { before, after } of [...moved].reverse()) {
        try {
          await rollbackItemMove(before, after, newParent)
        }
        catch (rollbackError) {
          logRollbackFailure('item move', rollbackError)
        }
      }
      throw error
    }
    return moved.map(entry => entry.after)
  },

  /* Return lost items to storage and restore their available status. */
  async locateItem(input: LocateItemSchemaInput, firnUser: FirnUser): Promise<InventoryItem[]> {
    const newParent = await resolveItemParent(input.newParentSlug, input.newParentKind)
    const items: InventoryItem[] = []
    for (const slug of input.itemSlug) {
      const item = await ItemService.getItemBySlug(slug)
      if (!item) {
        throw new Error(`Item with identifier "${slug}" not found.`)
      }
      if (item.status !== 'lost') {
        throw new Error(`Item "${slug}" cannot be located because it is "${item.status}", not "lost".`)
      }
      items.push(item)
    }
    assertBatchCapacityAvailable(newParent, items)

    const placed: { before: InventoryItem, after: InventoryItem }[] = []
    try {
      for (const item of items) {
        const after = await moveItemOne(
          item,
          newParent,
          items.length === 1 ? input.position ?? null : null,
          firnUser,
          input.logComment,
          { actionType: 'locate', newStatus: 'available' }
        )
        placed.push({ before: item, after })
      }
    }
    catch (error) {
      for (const { before, after } of [...placed].reverse()) {
        try {
          await rollbackItemMove(before, after, newParent)
        }
        catch (rollbackError) {
          logRollbackFailure('item locate', rollbackError)
        }
      }
      throw error
    }
    return placed.map(entry => entry.after)
  },

  /* Apply non-dedicated lifecycle actions and append an immutable audit entry. */
  async alterItem(input: AlterItemSchemaInput, firnUser: FirnUser): Promise<InventoryItem[]> {
    if (!isAlterAction(input.performedAction)) {
      throw new Error(`Action "${input.performedAction}" must use its dedicated item workflow.`)
    }
    if ((input.performedAction === 'flag' || input.performedAction === 'unflag') && !input.flagKind) {
      throw new Error(`Action "${input.performedAction}" requires a flag kind.`)
    }

    const items: InventoryItem[] = []
    for (const slug of input.itemSlug) {
      const item = await ItemService.getItemBySlug(slug)
      if (!item) {
        throw new Error(`Item with identifier "${slug}" not found.`)
      }
      if (!allowedActionsForStatus(item.status).includes(input.performedAction)) {
        throw new Error(`Action "${input.performedAction}" is not allowed on item "${slug}" while it is "${item.status}".`)
      }
      items.push(item)
    }

    const vacating = isVacatingAction(input.performedAction)
    const altered: InventoryItem[] = []
    for (const existing of items) {
      const currentFlags = existing.activeFlags ?? []
      let activeFlags = currentFlags
      if (input.performedAction === 'flag' && input.flagKind) {
        const flag: InventoryActiveFlag = { kind: input.flagKind, comment: input.logComment ?? null }
        activeFlags = currentFlags.some(entry => entry.kind === input.flagKind)
          ? currentFlags.map(entry => entry.kind === input.flagKind ? flag : entry)
          : [...currentFlags, flag]
      }
      else if (input.performedAction === 'unflag' && input.flagKind) {
        activeFlags = currentFlags.filter(entry => entry.kind !== input.flagKind)
      }

      const formerParent = existing.parent
      const formerPosition = existing.position
      const status = statusFromAction(input.performedAction) ?? existing.status
      const updated: InventoryItem = {
        ...existing,
        activeFlags,
        status,
        ...(vacating && { parent: null, position: null }),
        updatedAt: new Date().toISOString()
      }
      const changes = createInventoryChangeRecords([
        { field: 'status', before: existing.status, after: updated.status },
        { field: 'activeFlags', before: currentFlags, after: activeFlags }
      ])
      updated.actionLog = [
        ...existing.actionLog,
        {
          actionType: input.performedAction,
          firnUser: toUserRef(firnUser),
          timestamp: updated.updatedAt,
          notes: buildAlterActionNotes('inventory_item', input.performedAction, existing.name, input.logComment, input.flagKind),
          flag: input.performedAction === 'flag' || input.performedAction === 'unflag'
            ? input.flagKind ?? undefined
            : undefined,
          changes: changes.length > 0 ? changes : undefined
        }
      ]

      const result = await couchDB.updateDocument(updated._id, updated, existing._rev)
      updated._rev = result.rev
      if (vacating) {
        await adjustParentRefOccupancy(formerParent, formerPosition, existing.category, -1)
      }
      altered.push(updated)
    }
    return altered
  },

  /* Link one external LIMS project to an item. */
  async addProjectRef(slug: string, projectId: string): Promise<InventoryItem | null> {
    const item = await ItemService.getItemBySlug(slug)
    if (!item) return null
    const built = await ProjectService.buildProjectDocumentRef(projectId)
    if (!built) return null
    const projectRefs = item.projectRefs ?? {}
    if (projectRefs[built.key]) return item

    const updated: InventoryItem = {
      ...item,
      projectRefs: { ...projectRefs, [built.key]: built.ref },
      updatedAt: new Date().toISOString()
    }
    const result = await couchDB.updateDocument(updated._id, updated, item._rev)
    updated._rev = result.rev
    return updated
  },

  /* Remove one external LIMS project link from an item. */
  async removeProjectRef(slug: string, projectId: string): Promise<InventoryItem | null> {
    const item = await ItemService.getItemBySlug(slug)
    if (!item || !item.projectRefs || !(projectId in item.projectRefs)) return item

    const { [projectId]: _removed, ...remaining } = item.projectRefs
    const updated: InventoryItem = {
      ...item,
      projectRefs: Object.keys(remaining).length > 0 ? remaining : null,
      updatedAt: new Date().toISOString()
    }
    const result = await couchDB.updateDocument(updated._id, updated, item._rev)
    updated._rev = result.rev
    return updated
  },

  /* Convert one stored item into the client-safe display projection. */
  convertToDisplayItem(
    item: InventoryItem,
    parent: StorageEquipment | Container | null,
    recentActionLog: DisplayInventoryActionLogEntry[]
  ): DisplayInventoryItem {
    const projectRefs: SerializedEntityRef[] = item.projectRefs
      ? Object.values(item.projectRefs)
          .flatMap(ref => Array.isArray(ref) ? ref : [ref])
          .filter((ref): ref is typeof ref & { slug: string } => ref.db === 'projects' && typeof ref.slug === 'string')
          .map(ref => ({ slug: ref.slug, name: ref.name ?? ref.slug, kind: 'project' as const }))
      : []
    return {
      slug: item.slug,
      category: item.category,
      classification: item.classification,
      name: item.name,
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      concentration: item.concentration,
      concentrationUnit: item.concentrationUnit,
      position: item.position,
      arrivalDate: item.arrivalDate,
      openingDate: item.openingDate,
      expiryDate: item.expiryDate,
      lotNumber: item.lotNumber,
      barcode: item.barcode,
      templateId: item.templateId,
      notes: item.notes,
      metadata: item.metadata,
      projectRefs: projectRefs.length > 0 ? projectRefs : null,
      status: item.status,
      activeFlags: item.activeFlags,
      parentRef: parent
        ? {
            slug: parent.slug,
            name: parent.name,
            kind: parent.type === 'storageEquipment' ? 'equipment' : 'container'
          }
        : null,
      recentActionLog,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }
  },

  /* Batch-convert items while resolving distinct parents and recent action-log users. */
  async convertMultipleToDisplayItems(items: InventoryItem[]): Promise<DisplayInventoryItem[]> {
    if (items.length === 0) return []
    const parentIds = [...new Set(
      items.map(item => item.parent?.id).filter((id): id is string => id !== undefined)
    )]
    const documents = await couchDB.getDocumentsByIds<StorageEquipment | Container>(parentIds)
    const parents = new Map<string, StorageEquipment | Container>()
    for (const document of documents) {
      if (document && (document.type === 'storageEquipment' || document.type === 'container')) {
        parents.set(document._id, document)
      }
    }
    return Promise.all(items.map(async (item) => {
      const parent = item.parent ? parents.get(item.parent.id) ?? null : null
      if (item.parent && !parent) {
        throw new Error(`Parent for item "${item.slug}" (ID: ${item.parent.id}) could not be resolved.`)
      }
      return ItemService.convertToDisplayItem(
        item,
        parent,
        await resolveActionLogUsers(item.actionLog.slice(-RECENT_LOG_ENTRIES))
      )
    }))
  },

  /* Retrieve the full enriched action history for one item. */
  async getItemActionLog(slug: string): Promise<DisplayInventoryActionLogEntry[]> {
    const item = await ItemService.getItemBySlug(slug)
    if (!item) {
      throw new Error(`Item with identifier "${slug}" not found.`)
    }
    return resolveActionLogUsers(item.actionLog)
  },

  /* Resolve an item's stored project references into detailed display data. */
  async getItemProjectRefs(slug: string): Promise<InventoryProjectRef[]> {
    const item = await ItemService.getItemBySlug(slug)
    if (!item) {
      throw new Error(`Item with identifier "${slug}" not found.`)
    }
    return ProjectService.resolveInventoryProjectRefs(item.projectRefs)
  }
}
