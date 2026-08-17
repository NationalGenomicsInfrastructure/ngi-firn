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
 * getContainersByParent(parentDocumentId, parentKind) - List direct children of an equipment or container parent
 *
 * PARENT RESOLUTION:
 * resolveParent(slug, kind) - Resolve a parent slug to its document (used during create/move when the slug is known from input)
 * resolveParentRef(ref) - Resolve a stored TypedDocumentReference to its document (used post-mutation when only _id is available)
 *
 * CREATE, UPDATE, DELETE CONTAINERS:
 * createContainer(input) - Create a container inside a storage-equipment or container parent
 * updateContainer(updates) - Update container metadata and capacity limits
 * deleteContainer(input) - Delete one or more containers when empty, freeing each one's slot on its parent (best-effort batch)
 * moveContainer(input) - Re-home one or more containers to a single shared equipment/container parent (strict-atomic batch)
 * alterContainer(input) - Perform actions on one or more containers (check-out, return, reserve, discard, dispose, flag) — strict-atomic batch
 *
 * CAPACITY AND OCCUPANCY MANAGEMENT:
 * adjustStoredCount(containerId, category, delta) - count-layout: increment/decrement a category's count
 * adjustOccupancy(containerId, position, delta) - grid-layout: occupy/free a slot with bounds + collision checks
 * validateAndJoinContainerCapacity(existing, updates) - Merge capacity-limit edits, preserving `stored`
 *
 * PROJECT REFERENCES:
 * addProjectRef(slug, projectId) - Link a project to this container by LIMS projectId; stores a DocumentReference with slug/name hints
 * removeProjectRef(slug, projectId) - Remove a project link by LIMS projectId
 *
 * TYPE CONVERSION:
 * convertToDisplayContainer(container, parent) - Strip CouchDB-internal fields, extract project hints from stored refs, truncate actionLog
 * convertMultipleToDisplayContainers(containers[]) - Batch-convert with one getDocumentsByIds call for all parents
 * FULL DETAIL RETRIEVAL (on demand):
 * getContainerActionLog(slug) - Fetch the complete action log for a container by slug
 * getContainerProjectRefs(slug) - Fetch fully resolved InventoryProjectRef[] for a container by slug (fetches from projects DB)
 *
 * Project ref resolution is handled by ProjectService.resolveInventoryProjectRefs — it is generic
 * across all inventory document types and lives in server/crud/projects.server.ts.
 */

import { couchDB, generateCouchDocId, generateSlug } from '../../database/couchdb'
import { deriveGridLabel, findFirstFreeGridSlot, isSlotOccupied, isWithinGrid, totalSlots } from './grid.server'
import {
  hasDirectChildren,
  resolveActionLogUsers,
  toParentRef,
  toUserRef
} from './relations.server'
import { EquipmentService } from './equipment.server'
import {
  buildAlterActionNotes,
  createChangelogEntry,
  createInventoryChangeRecords,
  statusFromAction
} from './logging.server'
import type {
  Container,
  InventoryProjectRef,
  DisplayContainer,
  DisplayInventoryActionLogEntry,
  GridPosition,
  InventoryActionLogEntry,
  SerializedEntityRef,
  StorageEquipment,
  AcceptedChildCapacity,
  ContainerMoveTarget
} from '../../../types/inventory'
import { ProjectService } from '../projects.server'
import type {
  ContainerCapacity,
  ContainerCapacityEntry,
  ContainerType,
  ContainerParentKindType,
  AlterContainerSchemaInput,
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
 * Resolving a parent yields a discriminated result so callers can branch their
 * acceptance/occupancy bookkeeping on the parent's kind.
 */
export type ResolvedParent
  = | { kind: 'equipment', doc: StorageEquipment }
    | { kind: 'container', doc: Container }

/*
 * Outcome of a (possibly batched) deleteContainer call. Deletion is best-effort:
 * every requested slug is attempted independently, so `deleted` holds the containers
 * that were removed and `failures` records the slugs that could not be (e.g. a
 * container that still holds children) together with the reason.
 */
export type DeleteContainerResult = {
  deleted: Container[]
  failures: { slug: string, error: string }[]
}

/* Number of action log entries included in DisplayContainer.recentActionLog. */
const RECENT_LOG_ENTRIES = 10

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

  /* List all direct container children of a given parent using the by_parent view index. */
  async getContainersByParent(parentDocumentId: string, parentKind: 'equipment' | 'container'): Promise<Container[]> {
    const parentType = parentKind === 'equipment' ? 'storageEquipment' : 'container'
    const result = await couchDB.queryView<[string, string], null, Container>(
      'firn-inventory',
      'by_parent',
      {
        key: [parentType, parentDocumentId],
        include_docs: true,
        reduce: false
      }
    )
    return result.rows
      .map(row => row.doc)
      .filter((doc): doc is Container => isContainer(doc))
  },

  /* List every container across the whole inventory, sorted by name. */
  async getAllContainers(): Promise<Container[]> {
    const result = await couchDB.queryView<string, null, Container>(
      'firn-inventory',
      'by_type',
      {
        key: 'container',
        include_docs: true,
        reduce: false
      }
    )
    return result.rows
      .map(row => row.doc)
      .filter((doc): doc is Container => isContainer(doc))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  /*
   * Project a parent's own capacity array into the child categories it accepts, with the
   * remaining free slot count for each. Authoritative and view-free: each stored capacity
   * entry carries a server-owned `stored` counter (maintained by adjustStoredCount /
   * adjustOccupancy), so free = max(0, total - stored). Equipment parents only accept
   * containers (childKind 'container', count layout). Consumers filter by childKind.
   */
  async getAcceptedChildCapacity(
    parentSlug: string,
    parentKind: ContainerParentKindType
  ): Promise<AcceptedChildCapacity[]> {
    const parent = await this.resolveParent(parentSlug, parentKind)

    if (parent.kind === 'equipment') {
      const capacity = parent.doc.capacity ?? []
      return capacity.map(entry => ({
        childKind: 'container' as const,
        type: entry.type,
        layout: 'count' as const,
        total: entry.capacity,
        stored: entry.stored,
        free: Math.max(0, entry.capacity - entry.stored)
      }))
    }

    const capacity = parent.doc.capacity ?? []
    return capacity.map((entry) => {
      const total = entry.layout === 'grid'
        ? entry.rows * entry.columns * (entry.levels ?? 1)
        : entry.capacity
      return {
        childKind: entry.childKind,
        type: entry.type,
        layout: entry.layout,
        total,
        stored: entry.stored,
        free: Math.max(0, total - entry.stored)
      }
    })
  },

  /*
   * Collect the CouchDB _ids of every descendant container of the given container
   * (children, grandchildren, ...). Used to keep move operations acyclic: a container
   * may never be re-homed into itself or into one of its own descendants. BFS over the
   * by_parent view; visited-tracking guards against pathological pre-existing cycles.
   */
  async collectDescendantIds(containerDocumentId: string): Promise<Set<string>> {
    const descendants = new Set<string>()
    const queue: string[] = [containerDocumentId]
    while (queue.length > 0) {
      const currentId = queue.shift() as string
      const children = await this.getContainersByParent(currentId, 'container')
      for (const child of children) {
        if (!descendants.has(child._id)) {
          descendants.add(child._id)
          queue.push(child._id)
        }
      }
    }
    return descendants
  },

  /*
   * Find every parent (equipment or container) that can accept a move of this container:
   * it must declare capacity for the container's type and still have a free slot. Sourced
   * from the `capacity_by_accepted_category` view (key [childKind, type]); the container
   * itself, its descendants and its current parent are excluded so the resulting list only
   * contains valid, non-cyclic destinations. Deduped by slug, sorted by name.
   */
  async getMoveTargetsForContainer(containerSlug: string): Promise<ContainerMoveTarget[]> {
    const existing = await this.getContainerBySlug(containerSlug)
    if (!existing) {
      throw new Error(`Container with identifier "${containerSlug}" not found.`)
    }

    const descendantIds = await this.collectDescendantIds(existing._id)
    const currentParentId = existing.parent?.id ?? null

    const result = await couchDB.queryView<
      [string, string],
      { free: number },
      StorageEquipment | Container
    >(
      'firn-inventory',
      'capacity_by_accepted_category',
      {
        key: ['container', existing.containerType],
        include_docs: true,
        reduce: false
      }
    )

    const targets = new Map<string, ContainerMoveTarget>()
    for (const row of result.rows) {
      const doc = row.doc
      if (!doc) continue
      if (doc._id === existing._id) continue
      if (currentParentId && doc._id === currentParentId) continue
      if (descendantIds.has(doc._id)) continue

      const free = row.value?.free ?? 0
      if (free <= 0) continue

      const slug = doc.slug
      if (!slug || targets.has(slug)) continue

      targets.set(slug, {
        slug,
        name: doc.name,
        kind: doc.type === 'storageEquipment' ? 'equipment' : 'container',
        free
      })
    }

    return [...targets.values()].sort((a, b) => a.name.localeCompare(b.name))
  },

  /*
   * Resolve a parent slug to its document.
   * Used during create/move operations when the parent slug is known from user input.
   * Throws when no parent with that slug exists.
   */
  async resolveParent(parentSlug: string, parentKind: ContainerParentKindType): Promise<ResolvedParent> {
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
  },

  /*
   * Resolve a stored TypedDocumentReference to its parent document.
   * Used post-mutation (and in the router) when only the stored CouchDB _id is available.
   * Returns null when the container has no parent or the parent document cannot be found.
   */
  async resolveParentRef(
    parentRef: Container['parent']
  ): Promise<StorageEquipment | Container | null> {
    if (!parentRef) return null
    const doc = await couchDB.getDocument<StorageEquipment | Container>(parentRef.id)
    if (!doc) return null
    return doc.type === 'storageEquipment' || doc.type === 'container' ? doc : null
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
    const parent = await ContainerService.resolveParent(input.parentSlug, input.parentKind)
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

    // Resolve LIMS project IDs to DocumentReferences server-side.
    // buildProjectDocumentRef fetches each project document and builds a reference with
    // slug/name hints; IDs that cannot be found are silently skipped.
    const projectRefsEntries = input.projectIds && input.projectIds.length > 0
      ? (await Promise.all(input.projectIds.map(id => ProjectService.buildProjectDocumentRef(id))))
          .filter((r): r is NonNullable<Awaited<ReturnType<typeof ProjectService.buildProjectDocumentRef>>> => r !== null)
      : []
    const projectRefs = projectRefsEntries.length > 0
      ? Object.fromEntries(projectRefsEntries.map(({ key, ref }) => [key, ref]))
      : null

    const containerDocument: Omit<Container, '_id' | '_rev'> = {
      type: 'container',
      schema: 1,
      parent: toParentRef(parent.doc),
      positionParent,
      slug: containerSlug,
      barcode: null,
      containerType: input.containerType,
      classification: input.classification,
      name: input.name,
      label: input.label?.trim() || null,
      description: input.description ?? null,
      capacity: initialCapacity.length > 0 ? initialCapacity : null,
      templateId: input.templateId ?? null,
      projectRefs,
      status: 'available',
      actionLog: [registrationLogEntry],
      activeFlags: [],
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
   * Update container metadata and capacity limits. The container's parent is unchanged, so no
   * parent occupancy bookkeeping happens here. Re-homing to a different parent belongs to a dedicated move operation.
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
  /*
   * Delete one or more containers, freeing each one's slot on its parent.
   *
   * Best-effort batch: every slug is attempted independently and a failure (e.g. a
   * container that still holds children) does NOT abort the rest — the caller is
   * expected to move that container's children out first and retry. No parent capacity
   * is corrupted by a failure because the parent occupancy/stored count is only
   * decremented after the document was successfully deleted.
   */
  async deleteContainer(input: DeleteContainerSchemaInput): Promise<DeleteContainerResult> {
    const deleted: Container[] = []
    const failures: { slug: string, error: string }[] = []

    for (const slug of input.containerSlug) {
      try {
        const existing = await ContainerService.getContainerBySlug(slug)
        if (!existing) {
          throw new Error(`Container with identifier "${slug}" not found.`)
        }

        if (await hasDirectChildren(existing._id)) {
          throw new Error(`Cannot delete container "${slug}" because it still contains child inventory.`)
        }

        await couchDB.deleteDocument(existing._id, existing._rev)

        // Free the slot/count this container held on its parent.
        await adjustParentRefOccupancy(existing.parent, existing.positionParent, existing.containerType, -1)

        deleted.push(existing)
      }
      catch (error) {
        failures.push({ slug, error: error instanceof Error ? error.message : String(error) })
      }
    }

    return { deleted, failures }
  },

  /*
   * Move one or more containers to a SINGLE shared destination parent.
   *
   * Strict-atomic intent: all deterministic preconditions (container existence, cycle
   * guards, and aggregate capacity on the target parent) are validated BEFORE any
   * write. Only then are the children re-homed one by one, each reserving the parent
   * before it is written (see moveContainerOne). If an execution step still fails
   * (e.g. a rare concurrent `_rev` conflict), every already-moved container is rolled
   * back to its original placement on a best-effort basis.
   *
   * CouchDB has no multi-document transactions, so a residual partial-write window
   * remains if a rollback itself fails; that is reconcilable by the parent occupancy
   * views and a future admin "recalculate capacities" tool.
   *
   * An explicit `position` is only honoured for a single-container request; batches are
   * auto-placed into the first free slots (enforced by moveContainerSchema).
   */
  async moveContainer(input: MoveContainerSchemaInput, firnUser: FirnUser): Promise<Container[]> {
    const newParent = await ContainerService.resolveParent(input.newParentSlug, input.newParentKind)

    // ---- Phase 1: validate every container before touching anything ----
    const containers: Container[] = []
    for (const slug of input.containerSlug) {
      const existing = await ContainerService.getContainerBySlug(slug)
      if (!existing) {
        throw new Error(`Container with identifier "${slug}" not found.`)
      }

      // Cycle guard: a container may never be moved into itself or into one of its own
      // descendants — that would detach the whole subtree from the hierarchy root and
      // corrupt occupancy bookkeeping. Only container parents can introduce a cycle.
      if (newParent.kind === 'container') {
        if (newParent.doc._id === existing._id) {
          throw new Error('A container cannot be moved into itself.')
        }
        const descendantIds = await ContainerService.collectDescendantIds(existing._id)
        if (descendantIds.has(newParent.doc._id)) {
          throw new Error('A container cannot be moved into one of its own descendants.')
        }
      }

      containers.push(existing)
    }

    // Aggregate capacity check against the parent's currently committed occupancy, so a
    // batch that cannot fit is rejected before any single move is written.
    assertBatchCapacityAvailable(newParent, containers)

    // ---- Phase 2: execute, rolling back committed moves if a later step fails ----
    const requestedPosition = containers.length === 1 ? input.position ?? null : null
    const moved: { before: Container, after: Container }[] = []

    try {
      for (const existing of containers) {
        const after = await moveContainerOne(existing, newParent, requestedPosition, firnUser, input.logComment)
        moved.push({ before: existing, after })
      }
    }
    catch (error) {
      // Best-effort rollback of the containers already re-homed in this batch.
      for (const { before, after } of [...moved].reverse()) {
        try {
          await rollbackContainerMove(before, after, newParent)
        }
        catch {
          // Surface the original failure regardless; the recalc tool can reconcile.
        }
      }
      throw error
    }

    return moved.map(entry => entry.after)
  },

  /*
   * Perform a lifecycle action (check-out, return, reserve, discard, dispose, flag, …)
   * on one or more containers at once.
   *
   * Strict-atomic intent: every requested slug is resolved and validated BEFORE any
   * document is written, so a bad slug (or an unsupported action / missing flag kind)
   * aborts the whole batch before it makes partial changes. The subsequent writes only
   * touch each container's own document — no parent capacity is involved — so the
   * residual risk is limited to a rare concurrent `_rev` conflict mid-batch, which is
   * reconcilable and acceptable per the documented CouchDB constraints.
   */
  async alterContainer(input: AlterContainerSchemaInput, firnUser: FirnUser): Promise<Container[]> {
    if (input.performedAction === 'register' || input.performedAction === 'move' || input.performedAction === 'modify') {
    // These actions are not meant to be supported by alterContainer; they have dedicated functions.
      // Providing them would pass the typecheck, though, since it was simpler for logging purposes to have supported and unsupported actions in one type.
      // Strictly a developer and not a user error.
      throw new Error(
        `Action "${input.performedAction}" is not supported in alterContainer. Blame your developer — they should have used the dedicated register, move, or modify workflows instead.`
      )
    }

    if ((input.performedAction === 'flag' || input.performedAction === 'unflag') && !input.flagKind) {
      throw new Error(`Action "${input.performedAction}" requires a flag kind.`)
    }

    // Phase 1: resolve and validate every container before any write.
    const existingContainers: Container[] = []
    for (const slug of input.containerSlug) {
      const existing = await ContainerService.getContainerBySlug(slug)
      if (!existing) {
        throw new Error(`Container with identifier "${slug}" not found.`)
      }
      existingContainers.push(existing)
    }

    // Phase 2: apply the action to each validated container.
    return Promise.all(existingContainers.map(async (existing) => {
      const currentFlags = existing.activeFlags ?? []
      let nextFlags = currentFlags

      if (input.performedAction === 'flag' && input.flagKind) {
        nextFlags = currentFlags.includes(input.flagKind)
          ? currentFlags
          : [...currentFlags, input.flagKind]
      }
      else if (input.performedAction === 'unflag' && input.flagKind) {
        nextFlags = currentFlags.filter(flag => flag !== input.flagKind)
      }

      const updatedContainer: Container = {
        ...existing,
        activeFlags: nextFlags,
        updatedAt: new Date().toISOString()
      }

      const newStatus = statusFromAction(input.performedAction)
      if (newStatus) {
        updatedContainer.status = newStatus
      }

      const changes = createInventoryChangeRecords([
        { field: 'status', before: existing.status, after: updatedContainer.status },
        { field: 'activeFlags', before: existing.activeFlags ?? [], after: updatedContainer.activeFlags ?? [] }
      ])

      const changelogEntry: InventoryActionLogEntry = {
        actionType: input.performedAction,
        firnUser: toUserRef(firnUser),
        timestamp: updatedContainer.updatedAt,
        notes: buildAlterActionNotes('container', input.performedAction, existing.name, input.logComment, input.flagKind),
        flag: input.performedAction === 'flag' || input.performedAction === 'unflag'
          ? input.flagKind ?? undefined
          : undefined,
        changes: changes.length > 0 ? changes : undefined
      }

      updatedContainer.actionLog = [...existing.actionLog, changelogEntry]

      const result = await couchDB.updateDocument(updatedContainer._id, updatedContainer, existing._rev)
      updatedContainer._rev = result.rev
      return updatedContainer
    }))
  },

  /*
   * Link a project to this container by LIMS projectId.
   * Fetches the project document to build a DocumentReference with slug/name hints (so list
   * views can display the association without a separate fetch), then merges it into the
   * container's projectRefs map keyed by projectId. No-op if the project is already linked.
   * Returns the updated Container, or null when the container or project cannot be found.
   */
  async addProjectRef(slug: string, projectId: string): Promise<Container | null> {
    const container = await ContainerService.getContainerBySlug(slug)
    if (!container) return null

    const built = await ProjectService.buildProjectDocumentRef(projectId)
    if (!built) return null

    const existing = container.projectRefs ?? {}
    if (existing[built.key]) return container // already linked

    const updated: Container = {
      ...container,
      projectRefs: { ...existing, [built.key]: built.ref },
      updatedAt: new Date().toISOString()
    }

    const result = await couchDB.updateDocument(updated._id, updated, container._rev!)
    updated._rev = result.rev
    return updated
  },

  /*
   * Remove a project link from this container by LIMS projectId.
   * No-op when the container has no projectRefs or the project was not linked.
   * Returns the updated Container, or null when the container cannot be found.
   */
  async removeProjectRef(slug: string, projectId: string): Promise<Container | null> {
    const container = await ContainerService.getContainerBySlug(slug)
    if (!container) return null

    if (!container.projectRefs || !(projectId in container.projectRefs)) return container

    const { [projectId]: _removed, ...remaining } = container.projectRefs
    const updated: Container = {
      ...container,
      projectRefs: Object.keys(remaining).length > 0 ? remaining : null,
      updatedAt: new Date().toISOString()
    }

    const result = await couchDB.updateDocument(updated._id, updated, container._rev!)
    updated._rev = result.rev
    return updated
  },

  /*
   * Strip CouchDB-internal fields before sending a single Container to the client.
   * Project associations are represented as SerializedEntityRef stubs extracted directly
   * from the stored DocumentReferenceMap slug/name hints — no projects DB fetch needed.
   * Use getContainerProjectRefs() when the full InventoryProjectRef detail is required.
   * actionLog is truncated to the most recent RECENT_LOG_ENTRIES entries.
   */
  convertToDisplayContainer(
    container: Container,
    parent: StorageEquipment | Container | null,
    recentActionLog: DisplayInventoryActionLogEntry[]
  ): DisplayContainer {
    const parentRef = parent === null
      ? null
      : {
          slug: parent.slug,
          name: parent.name,
          kind: (parent.type === 'storageEquipment' ? 'equipment' : 'container') as 'equipment' | 'container'
        }

    const projectRefs: SerializedEntityRef[] = container.projectRefs
      ? Object.values(container.projectRefs)
          .flatMap(ref => Array.isArray(ref) ? ref : [ref])
          .filter((ref): ref is typeof ref & { slug: string } => ref.db === 'projects' && typeof ref.slug === 'string')
          .map(ref => ({ slug: ref.slug, name: ref.name ?? ref.slug, kind: 'project' as const }))
      : []

    return {
      slug: container.slug,
      barcode: container.barcode,
      containerType: container.containerType,
      classification: container.classification,
      name: container.name,
      label: container.label,
      description: container.description,
      capacity: container.capacity,
      positionParent: container.positionParent,
      templateId: container.templateId,
      projectRefs: projectRefs.length > 0 ? projectRefs : null,
      activeFlags: container.activeFlags,
      status: container.status,
      parentRef,
      recentActionLog,
      createdAt: container.createdAt,
      updatedAt: container.updatedAt
    }
  },

  /*
   * Enrich the most recent RECENT_LOG_ENTRIES action log entries of a container,
   * resolving each entry's user reference into a client-safe SerializedUserRef.
   */
  async enrichRecentActionLog(container: Container): Promise<DisplayInventoryActionLogEntry[]> {
    return resolveActionLogUsers(container.actionLog.slice(-RECENT_LOG_ENTRIES))
  },

  /*
   * Convert a list of Container documents to their display projections.
   * One batch fetch resolves all distinct parent documents; project associations
   * are extracted from the stored DocumentReferenceMap hints (no projects DB fetch).
   * Use getContainerProjectRefs() when full InventoryProjectRef detail is needed.
   */
  async convertMultipleToDisplayContainers(containers: Container[]): Promise<DisplayContainer[]> {
    if (containers.length === 0) return []

    // Batch-fetch distinct parent documents.
    const parentIds = [...new Set(
      containers.map(c => c.parent?.id).filter((id): id is string => id !== undefined)
    )]
    const parentDocs = await couchDB.getDocumentsByIds<StorageEquipment | Container>(parentIds)
    const parentMap = new Map<string, StorageEquipment | Container>()
    for (const doc of parentDocs) {
      if (doc && (doc.type === 'storageEquipment' || doc.type === 'container')) {
        parentMap.set(doc._id, doc)
      }
    }

    return Promise.all(containers.map(async (c) => {
      const parent = c.parent ? (parentMap.get(c.parent.id) ?? null) : null
      if (c.parent && !parent) {
        throw new Error(`Parent for container "${c.slug}" (ID: ${c.parent.id}) could not be resolved.`)
      }
      const recentActionLog = await ContainerService.enrichRecentActionLog(c)
      return ContainerService.convertToDisplayContainer(c, parent, recentActionLog)
    }))
  },

  /*
   * Fetch the full embedded action log for a container by slug.
   * Re-fetches the document from CouchDB so callers that only hold a DisplayContainer
   * (which carries only the recent slice) can request the complete audit trail on demand.
   * User references are enriched into client-safe SerializedUserRef stubs (no _id leakage).
   */
  async getContainerActionLog(slug: string): Promise<DisplayInventoryActionLogEntry[]> {
    const container = await ContainerService.getContainerBySlug(slug)
    if (!container) {
      throw new Error(`Container with identifier "${slug}" not found.`)
    }
    return resolveActionLogUsers(container.actionLog)
  },

  /*
   * Fetch fully resolved InventoryProjectRef stubs for a container by slug.
   * Fetches from the projects DB on demand — use only when the client needs the full
   * project detail (application, affiliation, status) beyond the slug/name hints already
   * present in DisplayContainer.projectRefs.
   */
  async getContainerProjectRefs(slug: string): Promise<InventoryProjectRef[]> {
    const container = await ContainerService.getContainerBySlug(slug)
    if (!container) {
      throw new Error(`Container with identifier "${slug}" not found.`)
    }
    return ProjectService.resolveInventoryProjectRefs(container.projectRefs)
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

/*
 * Apply a capacity delta on a container's stored parent reference (a
 * TypedDocumentReference), used to free (or re-occupy) the SOURCE parent's slot/count
 * during a move or delete — where only the stored ref and old position are known:
 *   - a recorded slot means the parent is a grid container → adjustOccupancy at the slot.
 *   - storageEquipment parent → adjustStoredCount by category.
 *   - count-layout container parent → adjustStoredCount by category.
 */
async function adjustParentRefOccupancy(
  parentRef: Container['parent'],
  position: GridPosition | null | undefined,
  childType: ContainerType,
  delta: number
): Promise<void> {
  if (!parentRef) return
  if (position) {
    await ContainerService.adjustOccupancy(parentRef.id, position, delta)
  }
  else if (parentRef.type === 'storageEquipment') {
    await EquipmentService.adjustStoredCount(parentRef.id, childType, delta)
  }
  else {
    await ContainerService.adjustStoredCount(parentRef.id, childType, delta)
  }
}

/*
 * Verify a resolved parent can accept a whole batch of containers against its currently
 * committed occupancy, before any move is written. Groups the batch by container type
 * and checks that every type is accepted and has enough free capacity/slots.
 */
function assertBatchCapacityAvailable(parent: ResolvedParent, containers: Container[]): void {
  const neededByType = new Map<string, number>()
  for (const container of containers) {
    neededByType.set(container.containerType, (neededByType.get(container.containerType) ?? 0) + 1)
  }

  if (parent.kind === 'container') {
    const capacity = parent.doc.capacity ?? []
    const gridEntry = capacity.find(entry => entry.layout === 'grid')

    if (gridEntry && gridEntry.layout === 'grid') {
      const available = totalSlots(gridEntry) - gridEntry.stored
      let totalNeeded = 0
      for (const [type, count] of neededByType) {
        if (gridEntry.childKind !== 'container' || gridEntry.type !== type) {
          throw new Error(`Container "${parent.doc.slug}" does not accept child containers of type "${type}".`)
        }
        totalNeeded += count
      }
      if (available < totalNeeded) {
        throw new Error(`Grid container "${parent.doc.slug}" has only ${available} free slot(s); ${totalNeeded} requested.`)
      }
      return
    }

    for (const [type, count] of neededByType) {
      const entry = capacity.find(
        capacityEntry => capacityEntry.layout === 'count' && capacityEntry.childKind === 'container' && capacityEntry.type === type
      )
      if (!entry || entry.layout !== 'count') {
        throw new Error(`Container "${parent.doc.slug}" does not accept child containers of type "${type}".`)
      }
      const available = entry.capacity - entry.stored
      if (available < count) {
        throw new Error(`Container "${parent.doc.slug}" has room for ${available} more "${type}"; ${count} requested.`)
      }
    }
    return
  }

  // Equipment parents are count-only (no grid layout).
  const capacity = parent.doc.capacity ?? []
  for (const [type, count] of neededByType) {
    const entry = capacity.find(capacityEntry => capacityEntry.type === type)
    if (!entry) {
      throw new Error(`Storage equipment "${parent.doc.slug}" does not accept containers of type "${type}".`)
    }
    const available = entry.capacity - entry.stored
    if (available < count) {
      throw new Error(`Storage equipment "${parent.doc.slug}" has room for ${available} more "${type}"; ${count} requested.`)
    }
  }
}

/*
 * Re-home a single container into an already-resolved parent.
 *
 * Ordering (CouchDB has no multi-document transactions, so this minimises the blast
 * radius of any single failure):
 *   1. RESERVE the destination parent BEFORE writing the child — concurrent placements
 *      are serialised on the parent `_rev` and any cap/occupancy violation throws before
 *      an orphan child is created. For grid parents `adjustOccupancy` consults the
 *      grid_occupancy view (fed by child positions), so the counter must be bumped while
 *      the target slot is still empty.
 *   2. WRITE the child to the destination.
 *   3. RELEASE the source parent's slot/count now that the child no longer lives there.
 *
 * If step 2 fails the destination reservation is released and the source is untouched.
 * If step 3 fails the child is reverted to the source and the destination reservation is
 * released, so the container is left exactly as it started. Returns the moved container
 * with its new `_rev`.
 */
async function moveContainerOne(
  existing: Container,
  newParent: ResolvedParent,
  requestedPosition: GridPosition | null,
  firnUser: FirnUser,
  logComment: string | null | undefined
): Promise<Container> {
  const positionParent = await resolvePlacement(newParent, requestedPosition, existing.containerType)

  await adjustParentOccupancy(newParent, existing.containerType, positionParent, 1)
  const now = new Date().toISOString()

  const movedContainer: Container = {
    ...existing,
    parent: toParentRef(newParent.doc),
    positionParent,
    updatedAt: now
  }

  const changelogEntry: InventoryActionLogEntry = {
    actionType: 'move',
    firnUser: toUserRef(firnUser),
    timestamp: now,
    notes: logComment ?? `Moved to parent "${newParent.doc.name}"${positionParent ? ` in position ${positionParent.label ?? deriveGridLabel(positionParent.row, positionParent.column, positionParent.level)}` : ''}".`
  }

  movedContainer.actionLog = [...existing.actionLog, changelogEntry]

  try {
    const result = await couchDB.updateDocument(movedContainer._id, movedContainer, existing._rev)
    movedContainer._rev = result.rev
  }
  catch (error) {
    // Child write failed: release the destination reservation so the counter does not
    // leak. The source parent was not touched yet, so it needs no reversal.
    try {
      await adjustParentOccupancy(newParent, existing.containerType, positionParent, -1)
    }
    catch {
      // Best-effort — surface the original failure regardless.
    }
    throw error
  }

  // Child re-homed: free the slot/count it previously held on the SOURCE parent.
  try {
    await adjustParentRefOccupancy(existing.parent, existing.positionParent, existing.containerType, -1)
  }
  catch (error) {
    // Could not free the source after the child moved. Revert this container to its
    // original placement (restore the doc, release the destination reservation) so the
    // batch is left consistent, then surface the failure.
    try {
      await couchDB.updateDocument(
        existing._id,
        { ...existing, updatedAt: new Date().toISOString() },
        movedContainer._rev
      )
    }
    catch {
      // Best-effort revert.
    }
    try {
      await adjustParentOccupancy(newParent, existing.containerType, positionParent, -1)
    }
    catch {
      // Best-effort revert.
    }
    throw error
  }

  return movedContainer
}

/*
 * Best-effort reversal of a fully-committed move within a failed batch. moveContainerOne
 * reserves the destination and frees the source, so the reversal must, in order:
 *   1. re-occupy the source slot/count (done first, while the source slot is still free —
 *      grid re-occupancy checks the slot is empty);
 *   2. restore the child document to its original parent, position and action log;
 *   3. release the destination reservation.
 */
async function rollbackContainerMove(
  before: Container,
  after: Container,
  newParent: ResolvedParent
): Promise<void> {
  await adjustParentRefOccupancy(before.parent, before.positionParent, before.containerType, 1)

  const restored: Container = {
    ...after,
    parent: before.parent,
    positionParent: before.positionParent,
    actionLog: before.actionLog,
    updatedAt: new Date().toISOString()
  }
  const result = await couchDB.updateDocument(restored._id, restored, after._rev)
  restored._rev = result.rev

  await adjustParentOccupancy(newParent, before.containerType, after.positionParent ?? null, -1)
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
