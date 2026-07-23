/*
 * ContainerService - Table of Contents
 * ************************************
 *
 * TYPE GUARDS AND RETRIEVAL:
 * isContainer(doc) - Check whether a fetched document is a Container
 *
 * CONTAINER LISTING AND RETRIEVAL:
 * getContainer(id) - Fetch one container document by ID
 * getContainerBySlug(slug) - Fetch one container document by slug
 * (planned) getAllContainers() / getContainersByEquipment(id) - not yet implemented
 *
 * CREATE, UPDATE, DELETE CONTAINERS:
 * createContainer(input) - Create a container inside a storage-equipment or container parent
 * updateContainer(updates) - Update container metadata and capacity limits
 * deleteContainer(input) - Delete a container when empty, freeing its slot on the parent
 * moveContainer(input) - Re-home a container to another equipment/container parent
 *
 * CAPACITY AND OCCUPANCY MANAGEMENT:
 * adjustStoredCount(containerId, category, delta) - count-layout: increment/decrement a category's count
 * adjustOccupancy(containerId, position, delta) - grid-layout: occupy/free a slot with bounds + collision checks
 * validateAndJoinContainerCapacity(existing, updates) - Merge capacity-limit edits, preserving `stored`
 *
 * TYPE CONVERSION:
 * (planned) convertToDisplayContainer / convertMultipleToDisplayContainers - need a DisplayContainer type
 */

import { couchDB, generateCouchDocId, generateSlug } from '../../database/couchdb'
import { deriveGridLabel, isSlotOccupied, isWithinGrid, totalSlots } from './grid.server'
import {
  hasDirectChildren,
  toParentRef,
  toUserRef
} from './relations.server'
import { EquipmentService } from './equipment.server'
import {
  createModifyActionLogEntry,
  type InventoryTrackedField
} from './logging.server'
import type {
  Container,
  GridPosition,
  InventoryActionLogEntry,
  StorageEquipment
} from '../../../types/inventory'
import type {
  ContainerCapacity,
  ContainerCapacityEntry,
  ContainerType,
  ContainerParentKindType,
  CreateContainerSchemaInput,
  DeleteContainerSchemaInput,
  MoveContainerSchemaInput,
  UpdateContainerSchemaInput
} from '~~/schemas/inventory/container'
import type { FirnUser } from '../../../types/auth'

/* Check if a document is a Container document. */
function isContainer(doc: unknown): doc is Container {
  if (!doc || typeof doc !== 'object') {
    return false
  }
  return (doc as Partial<Container>).type === 'container'
}

/* Query container documents by [type, slug] using the inventory view index. */
async function queryContainersBySlug(slug: string): Promise<Container[]> {
  const result = await couchDB.queryView<[string, string], null, Container>(
    'firn-inventory',
    'by_slug',
    {
      key: ['container', slug],
      include_docs: true,
      reduce: false
    }
  )

  return result.rows
    .map(row => row.doc)
    .filter((doc): doc is Container => isContainer(doc))
}

/*
 * A container's parent is either a piece of storage equipment or another container.
 * Resolving a parent slug therefore yields a discriminated result so callers can
 * branch their acceptance/occupancy bookkeeping on the parent's kind.
 */
type ResolvedParent
  = | { kind: 'equipment', doc: StorageEquipment }
    | { kind: 'container', doc: Container }

/*
 * Resolve a parent slug against BOTH container and storage-equipment types.
 * Containers are checked first (the more common nesting case); a storage-equipment
 * parent is the fallback. Throws when no parent with that slug exists.
 */
async function resolveParent(parentSlug: string, parentKind: ContainerParentKindType): Promise<ResolvedParent> {
  if (parentKind === 'container') {
    const container = (await queryContainersBySlug(parentSlug))[0]
    if (container && isContainer(container)) {
      return { kind: 'container', doc: container }
    }
  }
  else {
    const equipment = await EquipmentService.getEquipmentBySlug(parentSlug)
    if (equipment) {
      return { kind: 'equipment', doc: equipment }
    }
  }

  throw new Error(`Parent with identifier "${parentSlug}" not found. Create the parent equipment or container first.`)
}

/*
 * Scan a grid entry row-major (level → row → column ascending) and return the first
 * free slot per the grid_occupancy view, or null when the grid is fully occupied.
 * Row-major means A1, A2, … across a row before moving to the next row.
 */
async function findFirstFreeGridSlot(
  parentDocumentId: string,
  entry: Extract<ContainerCapacityEntry, { layout: 'grid' }>
): Promise<GridPosition | null> {
  const levels = entry.levels ?? 1
  for (let level = 1; level <= levels; level++) {
    for (let row = 1; row <= entry.rows; row++) {
      for (let column = 1; column <= entry.columns; column++) {
        const position = { row, column, level }
        if (!(await isSlotOccupied(parentDocumentId, position))) {
          return { row, column, level, label: deriveGridLabel(row, column, level) }
        }
      }
    }
  }
  return null
}

function createChangelogEntry(
  existing: Container,
  next: Container,
  firnUser: FirnUser,
  manualComment?: string
): InventoryActionLogEntry | null {
  const trackedFields: InventoryTrackedField[] = [
    { field: 'containerType', before: existing.containerType, after: next.containerType },
    { field: 'classification', before: existing.classification, after: next.classification },
    { field: 'name', before: existing.name, after: next.name },
    { field: 'slug', before: existing.slug, after: next.slug },
    { field: 'label', before: existing.label, after: next.label },
    { field: 'description', before: existing.description, after: next.description },
    { field: 'projectRefs', before: existing.projectRefs, after: next.projectRefs },
    { field: 'capacity', before: existing.capacity, after: next.capacity }
  ]

  return createModifyActionLogEntry({
    firnUser,
    trackedFields,
    timestamp: next.updatedAt,
    notes: manualComment ?? `modified container "${next.name}".`
  })
}

export const ContainerService = {

  /* Fetch one container document by document ID. */
  async getContainer(containerDocumentId: string): Promise<Container | null> {
    const container = await couchDB.getDocument<Container>(containerDocumentId)
    return isContainer(container) ? container : null
  },

  /* Fetch one container document by slug. */
  async getContainerBySlug(slug: string): Promise<Container | null> {
    const container = (await queryContainersBySlug(slug))[0]
    return container && isContainer(container) ? container : null
  },

  /*
   * Validate and merge capacity restrictions while preserving stored counts.
   * Analogous to EquipmentService.validateAndJoinContainerCapacity: types with an
   * existing entry keep their `stored`, newly declared types start at `stored: 0`,
   * and existing types missing from `updates` are dropped. A new limit must not fall
   * below what is already stored (for grids: below the number of occupied slots).
   * The XOR between grid and count layouts is enforced upstream by the zod
   * containerCapacityArraySchema, so this only guards the per-entry limits.
   */
  validateAndJoinContainerCapacity(
    existing: Container['capacity'],
    updates: ContainerCapacity[]
  ): ContainerCapacityEntry[] {
    const existingByType = new Map((existing ?? []).map(entry => [entry.type, entry]))
    const merged: ContainerCapacityEntry[] = []

    for (const entry of updates) {
      const stored = existingByType.get(entry.type)?.stored ?? 0
      const total = totalSlots(entry)

      if (total < stored) {
        throw new Error(
          `Cannot set capacity for category "${entry.type}" to ${total}: ${stored} are already stored.`
        )
      }

      if (entry.layout === 'grid') {
        merged.push({
          layout: 'grid',
          childKind: entry.childKind,
          type: entry.type,
          rows: entry.rows,
          columns: entry.columns,
          levels: entry.levels ?? 1,
          stored
        })
      }
      else {
        merged.push({
          layout: 'count',
          childKind: entry.childKind,
          type: entry.type,
          capacity: entry.capacity,
          stored
        })
      }
    }

    return merged
  },

  /*
   * Adjust the stored count for a numeric ('count'-layout) capacity category.
   * Mirrors EquipmentService.adjustStoredCount:
   *  - If the category has no count entry, nothing is tracked (atCapacity: false).
   *  - Throws when delta would push stored below 0 or above the defined capacity.
   */
  async adjustStoredCount(
    containerDocumentId: string,
    category: string,
    delta: number
  ): Promise<{ container: Container, atCapacity: boolean }> {
    const container = await ContainerService.getContainer(containerDocumentId)
    if (!container) {
      throw new Error(`Container with ID "${containerDocumentId}" not found.`)
    }

    const entry = container.capacity?.find(
      capacityEntry => capacityEntry.layout === 'count' && capacityEntry.type === category
    )

    // No count entry for this category — nothing to track, no cap to enforce.
    if (!entry || entry.layout !== 'count') {
      return { container, atCapacity: false }
    }

    const newStored = entry.stored + delta
    if (newStored < 0) {
      throw new Error(
        `Cannot decrement stored count for "${category}" below zero (current: ${entry.stored}).`
      )
    }
    if (newStored > entry.capacity) {
      throw new Error(
        `Cannot store another "${category}" in container "${container.slug}": capacity of ${entry.capacity} is already reached.`
      )
    }

    return {
      container: await writeCapacity(container, entry.type, newStored),
      atCapacity: newStored === entry.capacity
    }
  },

  /*
   * Occupy (delta > 0) or free (delta < 0) a slot in a grid ('grid'-layout) container.
   * Validates the position is within the declared grid, and on occupy that the target
   * slot is free (per grid_occupancy). Increments/decrements the grid entry's `stored`.
   *
   * NOTE: CouchDB has no multi-document transactions. The caller must write the child's
   * GridPosition FIRST and then call this to bump the parent counter — if this write
   * fails, the grid_occupancy view (fed by the child) remains the source of truth and
   * the counter is reconcilable. Uses read-modify-write on `_rev`; on a 409 conflict the
   * caller should re-fetch and retry.
   */
  async adjustOccupancy(
    containerDocumentId: string,
    position: { row: number, column: number, level?: number },
    delta: number
  ): Promise<{ container: Container, atCapacity: boolean }> {
    const container = await ContainerService.getContainer(containerDocumentId)
    if (!container) {
      throw new Error(`Container with ID "${containerDocumentId}" not found.`)
    }

    const entry = container.capacity?.find(capacityEntry => capacityEntry.layout === 'grid')
    if (!entry || entry.layout !== 'grid') {
      throw new Error(`Container "${container.slug}" has no grid layout to occupy.`)
    }

    if (!isWithinGrid(position, { rows: entry.rows, columns: entry.columns, levels: entry.levels ?? 1 })) {
      throw new Error(
        `Position (row ${position.row}, column ${position.column}, level ${position.level ?? 1}) is outside the ${entry.rows}×${entry.columns}×${entry.levels ?? 1} grid of "${container.slug}".`
      )
    }

    if (delta > 0 && await isSlotOccupied(containerDocumentId, position)) {
      throw new Error(
        `Slot (row ${position.row}, column ${position.column}, level ${position.level ?? 1}) in "${container.slug}" is already occupied.`
      )
    }

    const total = totalSlots(entry)
    const newStored = entry.stored + delta
    if (newStored < 0) {
      throw new Error(`Cannot free a slot in "${container.slug}": grid is already empty.`)
    }
    if (newStored > total) {
      throw new Error(`Cannot occupy another slot in "${container.slug}": all ${total} slots are full.`)
    }

    return {
      container: await writeCapacity(container, entry.type, newStored),
      atCapacity: newStored === total
    }
  },

  /*
   * Create a container inside a storage-equipment or container parent.
   *
   * Flow: resolve the parent, verify it accepts this container type and (for grid
   * parents) select a slot, then RESERVE capacity on the parent BEFORE writing the
   * child. Reserving first means the parent document's `_rev` serialises concurrent
   * placements and any cap/occupancy violation throws before an orphan child can be
   * created. It is also required for grid parents: `adjustOccupancy` consults the
   * grid_occupancy view (fed by child positions), so the counter must be bumped while
   * the target slot is still empty — i.e. before this child exists.
   */
  async createContainer(input: CreateContainerSchemaInput, firnUser: FirnUser): Promise<Container> {
    const parent = await resolveParent(input.parentSlug, input.parentKind)
    const positionParent = await resolvePlacement(parent, input.position ?? null, input.containerType)

    await adjustParentOccupancy(parent, input.containerType, positionParent, 1)

    const containerSlug = generateSlug(input.name)
    const containerDocumentId = generateCouchDocId('container')
    const now = new Date().toISOString()

    // Convert the wire-shape capacity rows into the stored ContainerCapacityEntry[]
    // shape, initialising `stored`/occupancy to zero for the new container's own contents.
    const initialCapacity = ContainerService.validateAndJoinContainerCapacity(null, input.capacity ?? [])

    const registrationLogEntry: InventoryActionLogEntry = {
      actionType: 'register',
      firnUser: toUserRef(firnUser),
      timestamp: now,
      notes: `Created in parent "${parent.doc.name}".`
    }

    const containerDocument: Omit<Container, '_id' | '_rev'> = {
      type: 'container',
      schema: 1,
      parent: toParentRef(parent.doc),
      positionParent,
      slug: containerSlug,
      containerType: input.containerType,
      classification: input.classification,
      name: input.name,
      label: input.label?.trim() || null,
      description: input.description ?? null,
      capacity: initialCapacity.length > 0 ? initialCapacity : null,
      templateId: input.templateId ?? null,
      projectRefs: input.projectRefs ?? null,
      status: 'available',
      actionLog: [registrationLogEntry],
      createdAt: now,
      updatedAt: now
    }

    try {
      const created = await couchDB.createDocument({
        ...containerDocument,
        _id: containerDocumentId
      })

      const container = await couchDB.getDocument<Container>(created.id)
      if (!isContainer(container)) {
        throw new Error('Failed to load container after creation.')
      }
      return container
    }
    catch (error) {
      // The parent was already reserved above; release it so the counter does not
      // leak when the child write fails after the reservation succeeded.
      try {
        await adjustParentOccupancy(parent, input.containerType, positionParent, -1)
      }
      catch {
        // Best-effort rollback — surface the original failure regardless.
      }
      throw error
    }
  },

  /*
   * Update container metadata and capacity limits. The parent is unchanged, so no
   * parent occupancy bookkeeping happens here (the container neither enters nor leaves
   * its parent). Re-homing to a different parent belongs to a dedicated move operation.
   */
  async updateContainer(updates: UpdateContainerSchemaInput, firnUser: FirnUser): Promise<Container> {
    const existing = await ContainerService.getContainerBySlug(updates.containerSlug)
    if (!existing) {
      throw new Error(`Container with identifier "${updates.containerSlug}" not found.`)
    }

    // Re-validate and merge capacity restrictions while preserving stored counts.
    // An explicitly provided empty array clears them (merged result is null); a missing
    // capacity leaves the existing restrictions untouched.
    let mergedCapacity = existing.capacity
    if (updates.capacity) {
      const merged = ContainerService.validateAndJoinContainerCapacity(existing.capacity, updates.capacity)
      mergedCapacity = merged.length > 0 ? merged : null
    }

    const updatedContainer: Container = {
      ...existing,
      containerType: updates.containerType ?? existing.containerType,
      classification: updates.classification ?? existing.classification,
      name: updates.name ?? existing.name,
      label: updates.label === undefined ? existing.label : (updates.label?.trim() || null),
      description: updates.description === undefined ? existing.description : (updates.description ?? null),
      projectRefs: updates.projectRefs === undefined ? existing.projectRefs : (updates.projectRefs ?? null),
      capacity: mergedCapacity,
      slug: updates.name && existing.name !== updates.name ? generateSlug(updates.name) : existing.slug,
      updatedAt: new Date().toISOString()
    }

    const changelogEntry = createChangelogEntry(existing, updatedContainer, firnUser, updates.logComment ?? undefined)
    updatedContainer.actionLog = changelogEntry
      ? [...existing.actionLog, changelogEntry]
      : existing.actionLog

    const result = await couchDB.updateDocument(updatedContainer._id, updatedContainer, existing._rev)
    updatedContainer._rev = result.rev
    return updatedContainer
  },

  /*
   * Delete a container only when it is empty, then free its slot / decrement the count
   * on the parent. The parent is decremented AFTER the child document is removed so the
   * grid_occupancy view no longer reports this container as occupying its slot.
   */
  async deleteContainer(input: DeleteContainerSchemaInput): Promise<Container> {
    const existing = await ContainerService.getContainerBySlug(input.containerSlug)
    if (!existing) {
      throw new Error(`Container with identifier "${input.containerSlug}" not found.`)
    }

    if (await hasDirectChildren(existing._id)) {
      throw new Error(`Cannot delete container "${input.containerSlug}" because it still contains child inventory.`)
    }

    await couchDB.deleteDocument(existing._id, existing._rev)

    const parentRef = existing.parent
    if (parentRef) {
      if (existing.positionParent) {
        // A recorded slot means the parent is a grid container.
        await ContainerService.adjustOccupancy(parentRef.id, existing.positionParent, -1)
      }
      else if (parentRef.type === 'storageEquipment') {
        await EquipmentService.adjustStoredCount(parentRef.id, existing.containerType, -1)
      }
      else {
        await ContainerService.adjustStoredCount(parentRef.id, existing.containerType, -1)
      }
    }

    return existing
  },

  /*
   * Move a container inside a storage-equipment or container parent.
   *
   * Flow: resolve the parent, verify it accepts this container type and (for grid
   * parents) select a slot, then RESERVE capacity on the parent BEFORE writing the
   * child. Reserving first means the parent document's `_rev` serialises concurrent
   * placements and any cap/occupancy violation throws before an orphan child can be
   * created. It is also required for grid parents: `adjustOccupancy` consults the
   * grid_occupancy view (fed by child positions), so the counter must be bumped while
   * the target slot is still empty — i.e. before this child exists.
   */
  async moveContainer(input: MoveContainerSchemaInput, firnUser: FirnUser): Promise<Container> {
    // Resolve the container to move to its document
    const existing = await ContainerService.getContainerBySlug(input.containerSlug)
    if (!existing) {
      throw new Error(`Container with identifier "${input.containerSlug}" not found.`)
    }

    // Resolve the new parent's doc and verify it accepts this container type
    // For grid parents: Verify the proposed slot is still free respectively propose a free slot.
    const new_parent = await resolveParent(input.newParentSlug, input.newParentKind)
    const positionParent = await resolvePlacement(new_parent, input.position, existing.containerType)

    // Reserve the new parent BEFORE writing the child, so concurrent placements are serialised
    await adjustParentOccupancy(new_parent, existing.containerType, positionParent, 1)
    const now = new Date().toISOString()

    try {
      // build the new container document with the new parent and position, and update the action log
      const movedContainer: Container = {
        ...existing,
        parent: toParentRef(new_parent.doc),
        positionParent,
        updatedAt: now
      }

      const changelogEntry: InventoryActionLogEntry = {
        actionType: 'move',
        firnUser: toUserRef(firnUser),
        timestamp: now,
        notes: input.logComment ?? `Moved to parent "${new_parent.doc.name}"${positionParent ? ` in position ${positionParent.label ?? deriveGridLabel(positionParent.row, positionParent.column, positionParent.level)}` : ''}".`
      }

      movedContainer.actionLog = changelogEntry
        ? [...existing.actionLog, changelogEntry]
        : existing.actionLog

      const result = await couchDB.updateDocument(movedContainer._id, movedContainer, existing._rev)

      // move was successful, return the updated container with the new _rev
      movedContainer._rev = result.rev
      return movedContainer
    }
    catch (error) {
      // The parent was already reserved above; release it so the counter does not
      // leak when the child write fails after the reservation succeeded.
      try {
        await adjustParentOccupancy(new_parent, existing.containerType, positionParent, -1)
      }
      catch {
        // Best-effort rollback — surface the original failure regardless.
      }
      throw error
    }
  }
}

/*
 * Verify the parent accepts a child container of `input.containerType` and, for grid
 * parents, choose the target slot. Returns the child's `positionParent` (null for
 * equipment and count-layout container parents; a GridPosition for grid parents).
 *
 * Storage equipment declares acceptance via a capacity entry whose `type` matches the
 * container type; a container parent additionally requires `childKind === 'container'`.
 * Throws when the parent does not accept this type or a grid parent is full.
 */
async function resolvePlacement(
  parent: ResolvedParent,
  proposedPosition: GridPosition | null | undefined,
  containerType: ContainerType
): Promise<GridPosition | null> {
  if (parent.kind === 'equipment') {
    const entry = parent.doc.capacity?.find(capacityEntry => capacityEntry.type === containerType)
    if (!entry) {
      throw new Error(`Storage equipment "${parent.doc.slug}" does not accept containers of type "${containerType}".`)
    }
    return null
  }

  const entry = parent.doc.capacity?.find(
    capacityEntry => capacityEntry.childKind === 'container' && capacityEntry.type === containerType
  )
  if (!entry) {
    throw new Error(`Container "${parent.doc.slug}" does not accept child containers of type "${containerType}".`)
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

  // No slot requested: auto-pick the first free slot, row-major. This is a PLANNED
  // placement — the reserved slot is intended to later drive an InventoryTask so lab
  // staff can confirm the container was physically put there.
  // TODO: emit that confirmation task once the task workflow exists.
  const plannedPosition = await findFirstFreeGridSlot(parent.doc._id, entry)
  if (!plannedPosition) {
    throw new Error(`Grid container "${parent.doc.slug}" is full; no free slot for a "${containerType}".`)
  }
  return plannedPosition
}

/*
 * Apply a capacity delta on the parent for a child container placement.
 *   - equipment / count-layout container → adjustStoredCount by category.
 *   - grid-layout container (position given) → adjustOccupancy at the slot.
 */
async function adjustParentOccupancy(
  parent: ResolvedParent,
  childType: ContainerType,
  position: GridPosition | null,
  delta: number
): Promise<void> {
  if (parent.kind === 'equipment') {
    await EquipmentService.adjustStoredCount(parent.doc._id, childType, delta)
  }
  else if (position) {
    await ContainerService.adjustOccupancy(parent.doc._id, position, delta)
  }
  else {
    await ContainerService.adjustStoredCount(parent.doc._id, childType, delta)
  }
}

/* Write back the container with `stored` updated for the entry matching `type`. */
async function writeCapacity(
  container: Container,
  type: string,
  newStored: number
): Promise<Container> {
  const updated: Container = {
    ...container,
    capacity: (container.capacity ?? []).map(entry =>
      entry.type === type ? { ...entry, stored: newStored } : entry
    ),
    updatedAt: new Date().toISOString()
  }

  const result = await couchDB.updateDocument(container._id, updated, container._rev)
  updated._rev = result.rev
  return updated
}
