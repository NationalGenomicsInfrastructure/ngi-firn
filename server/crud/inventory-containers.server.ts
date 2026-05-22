/*
 * ContainerService - Table of Contents
 * ***********************************
 *
 * INTERNAL HELPERS:
 * ensureViewsReady() - Ensure required CouchDB views are present before view queries
 * isContainer(doc) - Type guard for container documents
 * isStorageEquipment(doc) - Type guard for storage equipment documents
 * isInventoryItem(doc) - Type guard for inventory item documents
 * assertUserId(userId) - Validate caller identity input
 * getContainerParent(parentId, parentType) - Resolve and validate a legal container parent
 * validatePlacement(parent, classification, position, excludeChildId?) - Enforce acceptance, capacity, and grid constraints
 * toContainerDocument(input, locationPath) - Build a normalized container document payload
 *
 * CONTAINER CRUD:
 * createContainer(input, userId) - Create a new container under a valid parent
 * getContainer(containerId) - Fetch one container by ID
 * getContainersByParent(parentId) - List direct child containers
 * getContainerContents(containerId) - List direct child containers and items
 * updateContainer(containerId, rev, updates, userId) - Update non-relocation container fields
 * moveContainer(containerId, newParentId, newParentType, position, userId) - Move container and cascade descendant paths
 * deleteContainer(containerId, rev) - Delete an empty container
 * getDescendants(containerId) - Return all descendant containers/items via ancestry view
 *
 * CAPACITY + PROJECT QUERIES:
 * suggestLocations(opts) - Find containers with free capacity for a given category/count
 * getByProject(projectId, db?) - Reverse lookup: all containers/items linked to a project
 */

import { couchDB } from '../database/couchdb'
import type {
  Container,
  CreateContainerInput,
  GridPosition,
  InventoryItem,
  LocationAncestor,
  StorageEquipment,
  SuggestedLocation,
  UpdateContainerInput
} from '../../types/inventory'
import {
  buildLocationPath,
  cascadeLocationPathUpdate,
  ensureInventoryViews,
  validateCapacity,
  validateContainerAcceptance,
  validateGridPosition
} from './inventory-helpers.server'

type ContainerParent = Container | StorageEquipment
type Descendant = Container | InventoryItem

let inventoryViewsReady: Promise<void> | null = null

async function ensureViewsReady(): Promise<void> {
  if (!inventoryViewsReady) {
    inventoryViewsReady = ensureInventoryViews()
  }

  await inventoryViewsReady
}

/* Check if a document is a Container document. */
function isContainer(doc: unknown): doc is Container {
  return Boolean(doc && typeof doc === 'object' && (doc as Container).type === 'container')
}

/* Check if a document is a StorageEquipment document. */
function isStorageEquipment(doc: unknown): doc is StorageEquipment {
  return Boolean(doc && typeof doc === 'object' && (doc as StorageEquipment).type === 'storageEquipment')
}

/* Check if a document is an InventoryItem document. */
function isInventoryItem(doc: unknown): doc is InventoryItem {
  return Boolean(doc && typeof doc === 'object' && (doc as InventoryItem).type === 'inventoryItem')
}

/* Require a non-empty user ID for mutations. */
function assertUserId(userId: string): void {
  if (!userId.trim()) {
    throw new Error('User ID is required.')
  }
}

/* Resolve and validate the parent for a container operation. */
async function getContainerParent(parentId: string, parentType: Container['parentType']): Promise<ContainerParent> {
  const parent = await couchDB.getDocument<ContainerParent>(parentId)
  if (!parent) {
    throw new Error(`Parent ${parentId} not found.`)
  }

  if (parentType === 'container' && !isContainer(parent)) {
    throw new Error(`Parent ${parentId} is not a container.`)
  }

  if (parentType === 'storageEquipment' && !isStorageEquipment(parent)) {
    throw new Error(`Parent ${parentId} is not storage equipment.`)
  }

  return parent
}

/* Validate whether a container can be placed under a parent at an optional grid position. */
async function validatePlacement(
  parent: ContainerParent,
  classification: Container['classification'],
  position: GridPosition | null,
  excludeChildId?: string
): Promise<void> {
  const acceptance = validateContainerAcceptance(parent, 'container', classification)
  if (!acceptance.valid) {
    throw new Error(acceptance.reason || 'Container is not accepted by parent.')
  }

  if (!excludeChildId) {
    const hasCapacity = await validateCapacity(parent._id, parent.capacity)
    if (!hasCapacity) {
      throw new Error(`Parent ${parent._id} has reached its capacity.`)
    }
  }

  if (!position) {
    return
  }

  if (!parent.rows || !parent.columns) {
    throw new Error('Parent does not define a grid but a position was provided.')
  }

  const gridCheck = await validateGridPosition(
    parent._id,
    position,
    parent.rows,
    parent.columns,
    excludeChildId
  )

  if (!gridCheck.valid) {
    throw new Error(gridCheck.reason || 'Invalid grid position.')
  }
}

/* Normalize a create-input payload into a persisted container document shape. */
function toContainerDocument(input: CreateContainerInput, locationPath: LocationAncestor[]): Omit<Container, '_id' | '_rev'> {
  const now = new Date().toISOString()

  return {
    type: 'container',
    schema: 1,
    containerId: input.containerId,
    containerType: input.containerType,
    classification: input.classification,
    name: input.name,
    label: input.label,
    description: input.description ?? null,
    parentId: input.parentId,
    parentType: input.parentType,
    locationPath,
    position: input.position ?? null,
    rows: input.rows ?? null,
    columns: input.columns ?? null,
    levels: input.levels ?? null,
    capacity: input.capacity ?? null,
    acceptedItemCategories: input.acceptedItemCategories ?? null,
    acceptedContainerCategories: input.acceptedContainerCategories ?? null,
    templateId: input.templateId ?? null,
    color: input.color ?? null,
    projectRefs: input.projectRefs ?? null,
    isActive: input.isActive ?? true,
    actionLog: [],
    createdAt: now,
    updatedAt: now
  }
}

export const ContainerService = {
  /* Create a container in a parent location with placement validation. */
  async createContainer(input: CreateContainerInput, userId: string): Promise<Container> {
    assertUserId(userId)
    await ensureViewsReady()

    const parent = await getContainerParent(input.parentId, input.parentType)
    await validatePlacement(parent, input.classification, input.position ?? null)

    const locationPath = buildLocationPath(parent)
    const newContainer = toContainerDocument(input, locationPath)

    const { id } = await couchDB.createDocument(newContainer)
    const created = await couchDB.getDocument<Container>(id)

    if (!created || !isContainer(created)) {
      throw new Error(`Failed to load created container ${id}.`)
    }

    return created
  },

  /* Fetch one container by document ID. */
  async getContainer(containerId: string): Promise<Container | null> {
    const container = await couchDB.getDocument<Container>(containerId)
    if (!container || !isContainer(container)) {
      return null
    }

    return container
  },

  /* List direct child containers for one parent entity. */
  async getContainersByParent(parentId: string): Promise<Container[]> {
    await ensureViewsReady()

    const parent = await couchDB.getDocument<ContainerParent>(parentId)
    if (!parent || (parent.type !== 'container' && parent.type !== 'storageEquipment')) {
      return []
    }

    const result = await couchDB.queryView<[Container['parentType'], string], null, Container>(
      'firn-inventory',
      'by_parent',
      {
        key: [parent.type, parentId],
        include_docs: true
      }
    )

    return result.rows
      .map(row => row.doc)
      .filter((doc): doc is Container => Boolean(doc && isContainer(doc)))
  },

  /* Fetch direct child containers and inventory items for a container. */
  async getContainerContents(containerId: string): Promise<{ containers: Container[], items: InventoryItem[] }> {
    await ensureViewsReady()

    const result = await couchDB.queryView<['container', string], null, Descendant>(
      'firn-inventory',
      'by_parent',
      {
        key: ['container', containerId],
        include_docs: true
      }
    )

    const containers: Container[] = []
    const items: InventoryItem[] = []

    for (const row of result.rows) {
      const doc = row.doc
      if (!doc) {
        continue
      }

      if (isContainer(doc)) {
        containers.push(doc)
      }
      else if (isInventoryItem(doc)) {
        items.push(doc)
      }
    }

    return { containers, items }
  },

  /* Update mutable container fields without changing hierarchy placement. */
  async updateContainer(
    containerId: string,
    rev: string,
    updates: UpdateContainerInput,
    userId: string
  ): Promise<Container> {
    assertUserId(userId)
    await ensureViewsReady()

    const existing = await ContainerService.getContainer(containerId)
    if (!existing) {
      throw new Error(`Container ${containerId} not found.`)
    }

    const parent = await getContainerParent(existing.parentId, existing.parentType)
    const nextClassification = updates.classification ?? existing.classification
    const nextPosition = updates.position === undefined ? existing.position : updates.position

    if (updates.capacity != null) {
      const hasCapacity = await validateCapacity(existing._id, updates.capacity)
      if (!hasCapacity) {
        throw new Error(`Container ${existing._id} capacity is lower than current contents.`)
      }
    }

    await validatePlacement(parent, nextClassification, nextPosition, existing._id)

    const updatedDoc: Container = {
      ...existing,
      containerId: updates.containerId ?? existing.containerId,
      containerType: updates.containerType ?? existing.containerType,
      classification: nextClassification,
      name: updates.name ?? existing.name,
      label: updates.label ?? existing.label,
      description: updates.description === undefined ? existing.description : updates.description,
      position: nextPosition,
      rows: updates.rows === undefined ? existing.rows : updates.rows,
      columns: updates.columns === undefined ? existing.columns : updates.columns,
      levels: updates.levels === undefined ? existing.levels : updates.levels,
      capacity: updates.capacity === undefined ? existing.capacity : updates.capacity,
      acceptedItemCategories: updates.acceptedItemCategories === undefined ? existing.acceptedItemCategories : updates.acceptedItemCategories,
      acceptedContainerCategories: updates.acceptedContainerCategories === undefined ? existing.acceptedContainerCategories : updates.acceptedContainerCategories,
      templateId: updates.templateId === undefined ? existing.templateId : updates.templateId,
      color: updates.color === undefined ? existing.color : updates.color,
      projectRefs: updates.projectRefs === undefined ? existing.projectRefs : updates.projectRefs,
      isActive: updates.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString()
    }

    const result = await couchDB.updateDocument(containerId, updatedDoc, rev)
    return {
      ...updatedDoc,
      _id: result.id,
      _rev: result.rev
    }
  },

  /* Move a container to another parent and cascade descendant location paths. */
  async moveContainer(
    containerId: string,
    newParentId: string,
    newParentType: Container['parentType'],
    position: GridPosition | null,
    userId: string
  ): Promise<Container> {
    assertUserId(userId)
    await ensureViewsReady()

    const container = await ContainerService.getContainer(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found.`)
    }

    if (containerId === newParentId) {
      throw new Error('Container cannot be moved into itself.')
    }

    const newParent = await getContainerParent(newParentId, newParentType)
    if (isContainer(newParent) && newParent.locationPath.some(ancestor => ancestor.id === containerId)) {
      throw new Error('Container cannot be moved into its own descendant.')
    }

    const sameParent = container.parentId === newParentId && container.parentType === newParentType

    const acceptance = validateContainerAcceptance(newParent, 'container', container.classification)
    if (!acceptance.valid) {
      throw new Error(acceptance.reason || 'Container is not accepted by new parent.')
    }

    if (!sameParent) {
      const hasCapacity = await validateCapacity(newParent._id, newParent.capacity)
      if (!hasCapacity) {
        throw new Error(`Parent ${newParent._id} has reached its capacity.`)
      }
    }

    if (position) {
      if (!newParent.rows || !newParent.columns) {
        throw new Error('New parent does not define a grid but a position was provided.')
      }

      const gridCheck = await validateGridPosition(
        newParent._id,
        position,
        newParent.rows,
        newParent.columns,
        container._id
      )

      if (!gridCheck.valid) {
        throw new Error(gridCheck.reason || 'Invalid grid position.')
      }
    }

    const newLocationPath = buildLocationPath(newParent)
    const updatedContainer: Container = {
      ...container,
      parentId: newParent._id,
      parentType: newParent.type,
      locationPath: newLocationPath,
      position,
      updatedAt: new Date().toISOString()
    }

    const updateResult = await couchDB.updateDocument(container._id, updatedContainer, container._rev)
    const movedContainer = {
      ...updatedContainer,
      _id: updateResult.id,
      _rev: updateResult.rev
    }

    await cascadeLocationPathUpdate(
      movedContainer._id,
      movedContainer.type,
      buildLocationPath(movedContainer)
    )

    return movedContainer
  },

  /* Delete a container only when it has no child containers or items. */
  async deleteContainer(containerId: string, rev: string): Promise<void> {
    await ensureViewsReady()

    const container = await ContainerService.getContainer(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found.`)
    }

    const contents = await ContainerService.getContainerContents(containerId)
    if (contents.containers.length > 0 || contents.items.length > 0) {
      throw new Error(`Container ${containerId} is not empty.`)
    }

    await couchDB.deleteDocument(container._id, rev)
  },

  /* Return all descendant containers/items using the ancestry view. */
  async getDescendants(containerId: string): Promise<Array<Container | InventoryItem>> {
    await ensureViewsReady()

    const result = await couchDB.queryView<['container', string], null, Descendant>(
      'firn-inventory',
      'by_ancestor',
      {
        key: ['container', containerId],
        include_docs: true
      }
    )

    const seen = new Set<string>()
    const descendants: Array<Container | InventoryItem> = []

    for (const row of result.rows) {
      const doc = row.doc
      if (!doc || seen.has(doc._id)) {
        continue
      }
      if (!isContainer(doc) && !isInventoryItem(doc)) {
        continue
      }
      seen.add(doc._id)
      descendants.push(doc)
    }

    return descendants
  },

  /*
   * Suggest containers with free capacity for storing a given number of items/containers.
   *
   * Uses two CouchDB view queries:
   * 1. capacity_by_accepted_category — find containers that accept the requested category
   * 2. children_count — count current occupancy per candidate
   *
   * Results are filtered by available >= count and optionally by ancestor subtree,
   * classification, and temperature preference.
   */
  async suggestLocations(opts: {
    category: string
    childType: 'item' | 'container'
    count: number
    classification?: string | null
    ancestorId?: string | null
    temperatureCelsius?: number | null
  }): Promise<SuggestedLocation[]> {
    await ensureViewsReady()

    // Step 1: find candidate containers by accepted category
    const specificKey: [string, string] = [opts.childType, opts.category]
    const wildcardKey: [string, string] = ['any', 'any']

    interface CapacityValue { capacity: number, classification: string | null, containerType: string | null }

    const [specificResult, wildcardResult] = await Promise.all([
      couchDB.queryView<[string, string], CapacityValue, Container>(
        'firn-inventory',
        'capacity_by_accepted_category',
        { key: specificKey, include_docs: true }
      ),
      couchDB.queryView<[string, string], CapacityValue, Container>(
        'firn-inventory',
        'capacity_by_accepted_category',
        { key: wildcardKey, include_docs: true }
      )
    ])

    // Deduplicate candidates (a container may appear in both specific and wildcard results)
    const candidateMap = new Map<string, { doc: Container | StorageEquipment, capacity: number }>()

    for (const row of [...specificResult.rows, ...wildcardResult.rows]) {
      if (!row.doc || candidateMap.has(row.doc._id)) continue
      if (!isContainer(row.doc) && !isStorageEquipment(row.doc)) continue
      candidateMap.set(row.doc._id, { doc: row.doc, capacity: row.value?.capacity ?? 0 })
    }

    if (candidateMap.size === 0) return []

    // Step 2: batch-query children_count for all candidate IDs
    const candidateIds = [...candidateMap.keys()]
    const countResult = await couchDB.queryView<string, number>(
      'firn-inventory',
      'children_count',
      { keys: candidateIds, group: true }
    )

    const occupancyMap = new Map<string, number>()
    for (const row of countResult.rows) {
      occupancyMap.set(row.key, row.value ?? 0)
    }

    // Step 3: compute availability and filter
    const suggestions: SuggestedLocation[] = []

    for (const [id, { doc, capacity }] of candidateMap) {
      const occupied = occupancyMap.get(id) ?? 0
      const available = capacity - occupied
      if (available < opts.count) continue

      // Optional classification filter
      if (opts.classification && isContainer(doc) && doc.classification !== 'other' && doc.classification !== opts.classification) {
        continue
      }

      // Optional ancestor subtree filter
      if (opts.ancestorId) {
        const inSubtree = doc.locationPath?.some(a => a.id === opts.ancestorId) || doc.parentId === opts.ancestorId
        if (!inSubtree) continue
      }

      // Resolve temperature from equipment ancestor if available
      let temperatureCelsius: number | null = null
      if (isStorageEquipment(doc)) {
        temperatureCelsius = doc.temperatureCelsius ?? null
      }
      else if (isContainer(doc)) {
        // Find equipment in locationPath and fetch its temperature
        const equipmentAncestor = doc.locationPath?.find(a => a.type === 'storageEquipment')
        if (equipmentAncestor) {
          const equipment = await couchDB.getDocument<StorageEquipment>(equipmentAncestor.id)
          if (equipment && isStorageEquipment(equipment)) {
            temperatureCelsius = equipment.temperatureCelsius ?? null
          }
        }
      }

      suggestions.push({
        containerId: doc._id,
        containerName: doc.name || doc.label,
        containerType: isContainer(doc) ? doc.containerType : 'other',
        capacity,
        occupied,
        available,
        locationPath: doc.locationPath ?? [],
        temperatureCelsius,
        classification: isContainer(doc) ? doc.classification : null
      })
    }

    // Step 4: sort by preference
    suggestions.sort((a, b) => {
      // Temperature match first (if requested)
      if (opts.temperatureCelsius != null) {
        const aDist = a.temperatureCelsius != null ? Math.abs(a.temperatureCelsius - opts.temperatureCelsius) : Infinity
        const bDist = b.temperatureCelsius != null ? Math.abs(b.temperatureCelsius - opts.temperatureCelsius) : Infinity
        if (aDist !== bDist) return aDist - bDist
      }
      // Then by most available space
      return b.available - a.available
    })

    return suggestions
  },

  /* Reverse lookup: find all containers and items linked to a given project via projectRefs. */
  async getByProject(projectId: string, db: string = 'projects'): Promise<Array<Container | InventoryItem>> {
    await ensureViewsReady()

    const result = await couchDB.queryView<[string, string], { type: string, name: string }, Container | InventoryItem>(
      'firn-inventory',
      'by_project',
      { key: [db, projectId], include_docs: true }
    )

    return result.rows
      .map(row => row.doc)
      .filter((doc): doc is Container | InventoryItem =>
        Boolean(doc && (isContainer(doc) || isInventoryItem(doc)))
      )
  }
}
