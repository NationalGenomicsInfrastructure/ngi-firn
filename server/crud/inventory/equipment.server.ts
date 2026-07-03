/*
 * LocationService - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isStorageEquipment(doc) - Check whether a fetched document is StorageEquipment
 *
 * EQUIPMENT LISTING AND RETRIEVAL:
 * getEquipment(equipmentDocumentId) - Fetch one equipment document by ID
 * getAllEquipment() - List all storage equipment across all rooms
 * getEquipmentByRoom(roomDocumentId) - List equipment in a room
 *
 * CREATE, UPDATE, DELETE EQUIPMENT:
 *
 * createEquipment(input, userId) - Create storage equipment within a room
 * updateEquipment(equipmentDocumentId, rev, updates, userId) - Update equipment metadata
 * deleteEquipment(equipmentDocumentId, rev) - Delete equipment when empty
 * moveEquipmentToRoom(equipmentDocumentId, newRoomId, userId) - Re-home equipment to another room
 */

import { couchDB, generateCouchDocId, generateSlug } from '../../database/couchdb'
import {
  getDescendantsByAncestor,
  toParentRef
} from './relations.server'
import { RoomService } from './rooms.server'
import type {
  Container,
  InventoryItem,
  StorageEquipment
} from '../../../types/inventory'
import type { CreateEquipmentInput, DeleteEquipmentInput, UpdateEquipmentInput, MoveEquipmentInput, EquipmentCapacityCount } from '~~/schemas/inventory/equipment'

/* Check if a document is a StorageEquipment document. */
function isStorageEquipment(doc: unknown): doc is StorageEquipment {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const candidate = doc as Partial<StorageEquipment>
  return candidate.type === 'storageEquipment'
}

/*
* Validate and merge capacity restrictions while preserving stored counts.
* This function ensures that existing stored counts are not violated by new capacity updates.
* It returns a merged capacity array that can be used to update the equipment document.
*/
function validateAndJoinEquipmentCapacity(
  existing: StorageEquipment['capacity'],
  updates: NonNullable<UpdateEquipmentInput['capacity']>
): EquipmentCapacityCount[] {
  const existingByType: EquipmentCapacityCount = {}

  for (const capacityEntry of existing ?? []) {
    if (!capacityEntry) {
      continue
    }

    Object.assign(existingByType, capacityEntry)
  }

  const updatesByType = new Map(updates.map(entry => [entry.type, entry.capacity]))
  const mergedByType: EquipmentCapacityCount = {}

  // Keep categories present in existing only when they are also provided in updates.
  for (const [category, existingCount] of Object.entries(existingByType)) {
    if (!existingCount) {
      continue
    }

    const updatedCapacity = updatesByType.get(category as keyof EquipmentCapacityCount)
    if (updatedCapacity == null) {
      continue
    }

    if (updatedCapacity < existingCount.stored) {
      throw new Error(
        `Cannot set capacity for category "${category}" to ${updatedCapacity}: ${existingCount.stored} items are already stored.`
      )
    }

    mergedByType[category as keyof EquipmentCapacityCount] = {
      stored: existingCount.stored,
      capacity: updatedCapacity
    }
  }

  // Add newly introduced categories that were not restricted before.
  for (const [category, updatedCapacity] of updatesByType) {
    if (mergedByType[category] || existingByType[category]) {
      continue
    }

    mergedByType[category] = {
      stored: 0,
      capacity: updatedCapacity
    }
  }

  return Object.keys(mergedByType).length > 0 ? [mergedByType] : []
}

export const EquipmentService = {

  /* Fetch one equipment document by document ID. */
  async getEquipment(equipmentDocumentId: string): Promise<StorageEquipment | null> {
    const equipment = await couchDB.getDocument<StorageEquipment>(equipmentDocumentId)
    return isStorageEquipment(equipment) ? equipment : null
  },

  /* Fetch one equipment document by slug. */
  async getEquipmentBySlug(slug: string): Promise<StorageEquipment | null> {
    const results = await couchDB.queryDocuments<StorageEquipment>({ type: 'storageEquipment', slug })
    const equipment = results[0]
    return equipment && isStorageEquipment(equipment) ? equipment : null
  },

  /* List all storage equipment across all rooms, sorted by name. */
  async getAllEquipment(): Promise<StorageEquipment[]> {
    const equipment = await couchDB.queryDocuments<StorageEquipment>({ type: 'storageEquipment' })
    return equipment.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* List all equipment that belongs to one room. */
  async getEquipmentByRoom(roomDocumentId: string): Promise<StorageEquipment[]> {
    const equipment = await couchDB.queryDocuments<StorageEquipment>({
      'type': 'storageEquipment',
      'parent.id': roomDocumentId,
      'parent.type': 'room'
    })
    return equipment.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Return all descendant containers/items beneath one equipment, flat. */
  async getEquipmentDescendants(equipmentDocumentId: string): Promise<Array<Container | InventoryItem>> {
    return getDescendantsByAncestor('storageEquipment', equipmentDocumentId)
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

    const equipmentDocument: Omit<StorageEquipment, '_id' | '_rev'> = {
      type: 'storageEquipment',
      schema: 1,
      parent: toParentRef(room),
      slug: equipmentSlug,
      equipmentType: input.equipmentType,
      name: input.name,
      label: input.label?.trim() || null,
      description: input.description ?? null,
      capacity: [input.capacity ?? null],
      temperatureCelsius: input.temperatureCelsius ?? null,
      temperatureSensorId: [input.temperatureSensorId ?? null],
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

    let mergedCapacity: StorageEquipment['capacity'] | undefined

    // Re-validate and merge capacity restrictions while preserving stored counts.
    if (updates.capacity) {
      const merged = validateAndJoinEquipmentCapacity(existing.capacity, updates.capacity)
      mergedCapacity = merged.length > 0 ? merged : null
    }

    // recreate the updated equipment document by merging existing and updates, and updating the timestamp
    const updatedEquipment = {
      ...existing,
      ...updates,
      slug: updates.name ? generateSlug(updates.name) : existing.slug,
      capacity: mergedCapacity, // Always use the merged capacity, even if it's null (to clear previous restrictions)
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

    const children = await couchDB.queryDocuments<{ _id: string }>({
      'parent.id': existing._id,
      'type': { $in: ['container', 'inventoryItem'] }
    })

    if (children.length > 0) {
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
  }
}
