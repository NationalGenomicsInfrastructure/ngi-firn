/*
 * Inventory Equipment Service - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isStorageEquipment(doc) - Check whether a fetched document is StorageEquipment
 * validateAndJoinEquipmentCapacity(existing, updates) - Merge capacity-limit edits, preserving `stored`
 *
 * EQUIPMENT LISTING AND RETRIEVAL:
 * getEquipment(equipmentDocumentId) - Fetch one equipment document by ID
 * getEquipmentBySlug(slug) - Fetch one equipment document by slug
 * getAllEquipment() - List all storage equipment across all rooms
 * getEquipmentByRoom(roomDocumentId) - List equipment in a room
 *
 * CREATE, UPDATE, DELETE EQUIPMENT:
 * createEquipment(input) - Create storage equipment within a room
 * updateEquipment(updates) - Update equipment metadata
 * deleteEquipment(equipment) - Delete equipment when empty
 * moveEquipmentToRoom(input) - Re-home equipment to another room
 *
 * CAPACITY MANAGEMENT:
 * adjustStoredCount(equipmentDocumentId, category, delta) - Increment/decrement stored count for a category
 *
 * TYPE CONVERSION:
 * convertToDisplayStorageEquipment(equipment, room) - Strip CouchDB-internal fields (room pre-fetched)
 * convertMultipleToDisplayStorageEquipment(equipment[]) - Batch-convert, resolving parent rooms efficiently
 */

import { couchDB, generateCouchDocId, generateSlug } from '../../database/couchdb'
import {
  hasDirectChildren,
  toParentRef
} from './relations.server'
import { RoomService } from './rooms.server'
import type {
  DisplayStorageEquipment,
  Room,
  StorageEquipment
} from '../../../types/inventory'
import type { CreateEquipmentInput, DeleteEquipmentInput, UpdateEquipmentInput, MoveEquipmentInput, EquipmentCapacityEntry } from '~~/schemas/inventory/equipment'
import type { ContainerType } from '~~/schemas/inventory/container'

/* Check if a document is a StorageEquipment document. */
function isStorageEquipment(doc: unknown): doc is StorageEquipment {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const candidate = doc as Partial<StorageEquipment>
  return candidate.type === 'storageEquipment'
}

/* Query equipment documents by [type, slug] using the inventory view index. */
async function queryEquipmentBySlug(slug: string): Promise<StorageEquipment[]> {
  const result = await couchDB.queryView<[string, string], null, StorageEquipment>(
    'firn-inventory',
    'by_slug',
    {
      key: ['storageEquipment', slug],
      include_docs: true,
      reduce: false
    }
  )

  return result.rows
    .map(row => row.doc)
    .filter((doc): doc is StorageEquipment => isStorageEquipment(doc))
}

/* Query all equipment documents by type using the inventory view index. */
async function queryAllEquipmentByType(): Promise<StorageEquipment[]> {
  const result = await couchDB.queryView<string, null, StorageEquipment>(
    'firn-inventory',
    'by_type',
    {
      key: 'storageEquipment',
      include_docs: true,
      reduce: false
    }
  )

  return result.rows
    .map(row => row.doc)
    .filter((doc): doc is StorageEquipment => isStorageEquipment(doc))
}

/* Query direct equipment children for a room parent using the inventory view index. */
async function queryEquipmentByRoomParent(roomDocumentId: string): Promise<StorageEquipment[]> {
  const result = await couchDB.queryView<[string | null, string], null, StorageEquipment>(
    'firn-inventory',
    'by_parent',
    {
      key: ['room', roomDocumentId],
      include_docs: true,
      reduce: false
    }
  )

  return result.rows
    .map(row => row.doc)
    .filter((doc): doc is StorageEquipment => isStorageEquipment(doc))
}

/*
* Validate and merge capacity restrictions while preserving stored counts.
* Returns one entry per container type provided in `updates`: types with an existing
* entry keep their `stored` count (which the new limit must not violate), newly
* restricted types start at `stored: 0`, and existing types missing from `updates`
* are dropped (their restriction is lifted).
*/
function validateAndJoinEquipmentCapacity(
  existing: StorageEquipment['capacity'],
  updates: NonNullable<UpdateEquipmentInput['capacity']>
): EquipmentCapacityEntry[] {
  const existingByType = new Map((existing ?? []).map(entry => [entry.type, entry]))

  // Deduplicate updates by type (last one wins) while validating stored counts.
  const mergedByType = new Map<ContainerType, EquipmentCapacityEntry>()

  for (const { type, capacity } of updates) {
    const stored = existingByType.get(type)?.stored ?? 0

    if (capacity < stored) {
      throw new Error(
        `Cannot set capacity for category "${type}" to ${capacity}: ${stored} items are already stored.`
      )
    }

    mergedByType.set(type, { type, stored, capacity })
  }

  return [...mergedByType.values()]
}

export const EquipmentService = {

  /* Fetch one equipment document by document ID. */
  async getEquipment(equipmentDocumentId: string): Promise<StorageEquipment | null> {
    const equipment = await couchDB.getDocument<StorageEquipment>(equipmentDocumentId)
    return isStorageEquipment(equipment) ? equipment : null
  },

  /* Fetch one equipment document by slug. */
  async getEquipmentBySlug(slug: string): Promise<StorageEquipment | null> {
    const results = await queryEquipmentBySlug(slug)
    const equipment = results[0]
    return equipment && isStorageEquipment(equipment) ? equipment : null
  },

  /* List all storage equipment across all rooms, sorted by name. */
  async getAllEquipment(): Promise<StorageEquipment[]> {
    const equipment = await queryAllEquipmentByType()
    return equipment.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* List all equipment that belongs to one room. */
  async getEquipmentByRoom(roomDocumentId: string): Promise<StorageEquipment[]> {
    const equipment = await queryEquipmentByRoomParent(roomDocumentId)
    return equipment.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Create storage equipment in a room and derive its initial locationPath. */
  async createEquipment(input: CreateEquipmentInput): Promise<StorageEquipment> {
    // retrieve the room document to ensure it exists and to get its reference
    const room = await RoomService.getRoomBySlug(input.parentSlug)
    if (!room) {
      throw new Error(`Room with identifier "${input.parentSlug}" not found. Please create the room first before adding equipment.`)
    }

    // generate equipment slug and document ID, and prepare the new equipment document
    const equipmentSlug = generateSlug(input.name)
    const equipmentDocumentId = generateCouchDocId('equipment')
    const now = new Date().toISOString()

    // Convert the wire-shape { type, capacity }[] input rows into the stored
    // EquipmentCapacityEntry[] shape, initializing stored counts to zero.
    const initialCapacity = validateAndJoinEquipmentCapacity(null, input.capacity ?? [])

    const equipmentDocument: Omit<StorageEquipment, '_id' | '_rev'> = {
      type: 'storageEquipment',
      schema: 1,
      parent: toParentRef(room),
      slug: equipmentSlug,
      equipmentType: input.equipmentType,
      name: input.name,
      label: input.label?.trim() || null,
      description: input.description ?? null,
      capacity: initialCapacity.length > 0 ? initialCapacity : null,
      temperatureCelsius: input.temperatureCelsius ?? null,
      temperatureSensorId: input.temperatureSensorId ?? null,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now
    }

    const created = await couchDB.createDocument({
      ...equipmentDocument,
      _id: equipmentDocumentId
    })

    const equipment = await couchDB.getDocument<StorageEquipment>(created.id)
    if (!isStorageEquipment(equipment)) {
      throw new Error('Failed to load storage equipment after creation.')
    }
    return equipment
  },

  /* Update equipment attributes */
  async updateEquipment(
    updates: UpdateEquipmentInput
  ): Promise<StorageEquipment> {
    const existing = await EquipmentService.getEquipmentBySlug(updates.equipmentSlug)

    if (!existing) {
      throw new Error(`Equipment with identifier "${updates.equipmentSlug}" not found.`)
    }

    // Strip request-only identifiers so they are not persisted into the document.
    const { equipmentSlug: _equipmentSlug, parentSlug: _parentSlug, capacity, ...updatedFields } = updates

    // Re-validate and merge capacity restrictions while preserving stored counts.
    // When the caller did not touch capacity, keep the existing restrictions;
    // an explicitly provided empty array clears them (merged result is null).
    let mergedCapacity = existing.capacity
    if (capacity) {
      const merged = validateAndJoinEquipmentCapacity(existing.capacity, capacity)
      mergedCapacity = merged.length > 0 ? merged : null
    }

    // recreate the updated equipment document by merging existing and updates, and updating the timestamp
    const updatedEquipment = {
      ...existing,
      ...updatedFields,
      slug: updates.name && existing.name !== updates.name ? generateSlug(updates.name) : existing.slug,
      capacity: mergedCapacity,
      updatedAt: new Date().toISOString()
    } as StorageEquipment

    const result = await couchDB.updateDocument(updatedEquipment._id, updatedEquipment, existing._rev)
    updatedEquipment._rev = result.rev

    return updatedEquipment
  },

  /* Delete equipment only when no direct child containers/items remain. */
  async deleteEquipment(equipment: DeleteEquipmentInput): Promise<StorageEquipment> {
    const existing = await EquipmentService.getEquipmentBySlug(equipment.equipmentSlug)

    if (!existing) {
      throw new Error(`Equipment with identifier "${equipment.equipmentSlug}" not found.`)
    }

    const equipmentHasChildren = await hasDirectChildren(existing._id)

    if (equipmentHasChildren) {
      throw new Error(`Cannot delete equipment "${equipment.equipmentSlug}" because it still contains child inventory.`)
    }

    await couchDB.deleteDocument(existing._id, existing._rev)
    return existing
  },

  /* Move equipment to another room and cascade descendant location paths. */
  async moveEquipmentToRoom(input: MoveEquipmentInput): Promise<StorageEquipment> {
    const equipment = await EquipmentService.getEquipmentBySlug(input.equipmentSlug)
    const targetRoom = await RoomService.getRoomBySlug(input.newRoomSlug)

    if (!equipment) {
      throw new Error(`Equipment with identifier "${input.equipmentSlug}" not found.`)
    }

    if (!targetRoom) {
      throw new Error(`Target room with identifier "${input.newRoomSlug}" not found.`)
    }

    const now = new Date().toISOString()
    const movedEquipment: StorageEquipment = {
      ...equipment,
      parent: toParentRef(targetRoom),
      updatedAt: now
    }

    const result = await couchDB.updateDocument(movedEquipment._id, movedEquipment, equipment._rev)
    movedEquipment._rev = result.rev

    return movedEquipment
  },

  /*
   * Increment or decrement the stored count for a given container category in the equipment's
   * capacity entries. Returns the updated equipment document and whether the category is now
   * at its defined maximum.
   *
   * - If the category has no capacity entry (no cap defined), the document is not
   *   written and atCapacity is always false.
   * - Throws when delta would push stored below 0 or above the defined capacity.
   */
  async adjustStoredCount(
    equipmentDocumentId: string,
    category: ContainerType,
    delta: number
  ): Promise<{ equipment: StorageEquipment, atCapacity: boolean }> {
    const equipment = await EquipmentService.getEquipment(equipmentDocumentId)

    if (!equipment) {
      throw new Error(`Equipment with ID "${equipmentDocumentId}" not found.`)
    }

    const entry = equipment.capacity?.find(capacityEntry => capacityEntry.type === category)

    // No capacity entry for this category — nothing to track, no cap to enforce.
    if (!entry) {
      return { equipment, atCapacity: false }
    }

    const newStored = entry.stored + delta

    if (newStored < 0) {
      throw new Error(
        `Cannot decrement stored count for "${category}" below zero (current: ${entry.stored}).`
      )
    }

    if (newStored > entry.capacity) {
      throw new Error(
        `Cannot store another "${category}" in equipment "${equipment.slug}": capacity of ${entry.capacity} is already reached.`
      )
    }

    const updatedEquipment: StorageEquipment = {
      ...equipment,
      capacity: (equipment.capacity ?? []).map(capacityEntry =>
        capacityEntry.type === category ? { ...capacityEntry, stored: newStored } : capacityEntry
      ),
      updatedAt: new Date().toISOString()
    }

    const result = await couchDB.updateDocument(equipment._id, updatedEquipment, equipment._rev)
    updatedEquipment._rev = result.rev

    return { equipment: updatedEquipment, atCapacity: newStored === entry.capacity }
  },

  /*
   * Strip CouchDB-internal fields before sending a single StorageEquipment to the client.
   * The caller must supply the pre-fetched parent Room to avoid an extra DB round-trip
   * when this method is called inside a batch loop.
   */
  convertToDisplayStorageEquipment(equipment: StorageEquipment, parentRoom: Room): DisplayStorageEquipment {
    return {
      slug: equipment.slug,
      equipmentType: equipment.equipmentType,
      name: equipment.name,
      label: equipment.label,
      description: equipment.description,
      capacity: equipment.capacity,
      temperatureCelsius: equipment.temperatureCelsius,
      temperatureSensorId: equipment.temperatureSensorId,
      manufacturer: equipment.manufacturer,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      isActive: equipment.isActive,
      parentRoom: { slug: parentRoom.slug, name: parentRoom.name },
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt
    }
  },

  /*
   * Convert a list of StorageEquipment documents to their display projections.
   * Batch-fetches the distinct parent rooms to avoid N+1 queries.
   */
  async convertMultipleToDisplayStorageEquipment(equipment: StorageEquipment[]): Promise<DisplayStorageEquipment[]> {
    if (equipment.length === 0) {
      return []
    }

    // Collect the distinct parent room document IDs and batch-fetch them.
    const roomIds = [...new Set(equipment.map(e => e.parent.id))]
    const roomDocs = await couchDB.getDocumentsByIds<Room>(roomIds)

    const roomMap = new Map<string, Room>()
    for (const doc of roomDocs) {
      if (doc && RoomService.isRoomPublic(doc)) {
        roomMap.set(doc._id, doc)
      }
    }

    return equipment.map((e) => {
      const parentRoom = roomMap.get(e.parent.id)
      if (!parentRoom) {
        throw new Error(`Parent room for equipment "${e.slug}" could not be resolved.`)
      }
      return EquipmentService.convertToDisplayStorageEquipment(e, parentRoom)
    })
  }
}
