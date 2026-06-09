/*
 * LocationService - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isRoom(doc) - Check whether a fetched document is a Room
 * isStorageEquipment(doc) - Check whether a fetched document is StorageEquipment
 * ensureUniqueRoomSlug(roomSlug, currentId?) - Prevent duplicate room slugs
 * getRequiredRoom(roomDocumentId) - Load room or throw
 * getRequiredEquipment(equipmentDocumentId) - Load equipment or throw
 *
 * ROOM CRUD:
 * createRoom(input, userId) - Create a room document
 * getRoom(roomDocumentId) - Fetch one room by document ID
 * getRoomBySlug(roomSlug) - Fetch one room by slug
 * getAllRooms() - List and sort all rooms
 * updateRoom(roomDocumentId, rev, updates, userId) - Update room fields and cascade path updates
 * deleteRoom(roomDocumentId, rev) - Delete an empty room
 *
 * STORAGE EQUIPMENT CRUD:
 * createEquipment(input, userId) - Create storage equipment within a room
 * getEquipment(equipmentDocumentId) - Fetch one equipment document by ID
 * getEquipmentByRoom(roomDocumentId) - List equipment in a room
 * updateEquipment(equipmentDocumentId, rev, updates, userId) - Update equipment metadata
 * deleteEquipment(equipmentDocumentId, rev) - Delete equipment when empty
 * moveEquipmentToRoom(equipmentDocumentId, newRoomId, userId) - Re-home equipment to another room
 */

import { couchDB } from '../database/couchdb'
import {
  buildLocationPath,
  cascadeLocationPathUpdate,
  generateInventoryId,
  toParentRef
} from './inventory-helpers.server'
import type {
  CreateRoomInput,
  CreateStorageEquipmentInput,
  Room,
  StorageEquipment,
  UpdateRoomInput,
  UpdateStorageEquipmentInput
} from '../../types/inventory'

/* Check if a document is a Room document. */
function isRoom(doc: unknown): doc is Room {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const candidate = doc as Partial<Room>
  return candidate.type === 'room'
}

/* Check if a document is a StorageEquipment document. */
function isStorageEquipment(doc: unknown): doc is StorageEquipment {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const candidate = doc as Partial<StorageEquipment>
  return candidate.type === 'storageEquipment'
}

/* Enforce uniqueness for the human-readable room slug. */
async function ensureUniqueRoomSlug(roomSlug: string, currentId?: string): Promise<void> {
  const existing = await couchDB.queryDocuments<Room>({ type: 'room', slug: roomSlug })
  const conflict = existing.find(room => room._id !== currentId)
  if (conflict) {
    throw new Error(`Room slug "${roomSlug}" already exists.`)
  }
}

/* Load an existing room and fail loudly when missing. */
async function getRequiredRoom(roomDocumentId: string): Promise<Room> {
  const room = await couchDB.getDocument<Room>(roomDocumentId)
  if (!isRoom(room)) {
    throw new Error(`Room "${roomDocumentId}" was not found.`)
  }
  return room
}

/* Load existing storage equipment and fail loudly when missing. */
async function getRequiredEquipment(equipmentDocumentId: string): Promise<StorageEquipment> {
  const equipment = await couchDB.getDocument<StorageEquipment>(equipmentDocumentId)
  if (!isStorageEquipment(equipment)) {
    throw new Error(`Storage equipment "${equipmentDocumentId}" was not found.`)
  }
  return equipment
}

/* Build the room URL slug from required location attributes. */
function buildRoomSlug(building: Room['building'], floor: number, roomNumber: string): string {
  const normalizedRoomNumber = roomNumber.trim().replace(/\s+/g, '')
  if (normalizedRoomNumber.length === 0) {
    throw new Error('Room number is required to generate the room slug.')
  }
  return `${building}-${floor}-${normalizedRoomNumber}`
}

export const LocationService = {
  /* Create a room and initialize metadata defaults. */
  async createRoom(input: CreateRoomInput, userId: string): Promise<Room> {
    void userId
    const roomSlug = buildRoomSlug(input.building, input.floor, input.roomNumber)
    await ensureUniqueRoomSlug(roomSlug)
    const now = new Date().toISOString()
    const roomDocument: Omit<Room, '_id' | '_rev'> = {
      type: 'room',
      schema: 1,
      slug: roomSlug,
      name: input.name,
      label: input.label ?? null,
      roomNumber: input.roomNumber.trim(),
      roomType: input.roomType,
      building: input.building,
      floor: input.floor,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now
    }

    const created = await couchDB.createDocument({
      ...roomDocument,
      _id: generateInventoryId('room')
    })

    const room = await couchDB.getDocument<Room>(created.id)
    if (!isRoom(room)) {
      throw new Error('Failed to load room after creation.')
    }
    return room
  },

  /* Fetch one room by document ID. */
  async getRoom(roomDocumentId: string): Promise<Room | null> {
    const room = await couchDB.getDocument<Room>(roomDocumentId)
    return isRoom(room) ? room : null
  },

  /* Fetch one room by slug. */
  async getRoomBySlug(roomSlug: string): Promise<Room | null> {
    const rooms = await couchDB.queryDocuments<Room>({ type: 'room', slug: roomSlug })
    const room = rooms[0]
    return room && isRoom(room) ? room : null
  },

  /* Return all rooms in a stable, name-sorted order. */
  async getAllRooms(): Promise<Room[]> {
    const rooms = await couchDB.queryDocuments<Room>({ type: 'room' })
    return rooms.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Update room fields and propagate locationPath changes to descendants. */
  async updateRoom(roomDocumentId: string, rev: string, updates: UpdateRoomInput, userId: string): Promise<Room> {
    void userId
    const existing = await getRequiredRoom(roomDocumentId)
    if (existing._rev !== rev) {
      throw new Error('Room revision conflict.')
    }

    const nextRoomNumber = updates.roomNumber !== undefined ? updates.roomNumber.trim() : existing.roomNumber
    const nextBuilding = updates.building ?? existing.building
    const nextFloor = updates.floor !== undefined ? updates.floor : existing.floor
    const shouldRegenerateRoomSlug
      = updates.roomNumber !== undefined || updates.building !== undefined || updates.floor !== undefined

    let nextRoomSlug = existing.slug
    if (shouldRegenerateRoomSlug) {
      if (nextRoomNumber == null || nextFloor == null) {
        throw new Error('Room number and floor are required to generate the room slug.')
      }
      nextRoomSlug = buildRoomSlug(nextBuilding, nextFloor, nextRoomNumber)
      if (nextRoomSlug !== existing.slug) {
        await ensureUniqueRoomSlug(nextRoomSlug, existing._id)
      }
    }

    const updatedRoom: Room = {
      ...existing,
      slug: nextRoomSlug,
      name: updates.name ?? existing.name,
      label: updates.label ?? existing.label,
      roomNumber: nextRoomNumber,
      roomType: updates.roomType ?? existing.roomType,
      building: nextBuilding,
      floor: nextFloor,
      description: updates.description !== undefined ? updates.description : existing.description,
      isActive: updates.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString()
    }

    const result = await couchDB.updateDocument(updatedRoom._id, updatedRoom, rev)
    updatedRoom._rev = result.rev

    await cascadeLocationPathUpdate(updatedRoom._id, 'room', [
      {
        id: updatedRoom._id,
        type: 'room'
      }
    ])

    return updatedRoom
  },

  /* Delete a room only when no storage equipment remains inside it. */
  async deleteRoom(roomDocumentId: string, rev: string): Promise<void> {
    const equipmentInRoom = await couchDB.queryDocuments<StorageEquipment>({
      'type': 'storageEquipment',
      'parent.id': roomDocumentId
    })
    if (equipmentInRoom.length > 0) {
      throw new Error(`Cannot delete room "${roomDocumentId}" because it still contains storage equipment.`)
    }

    await couchDB.deleteDocument(roomDocumentId, rev)
  },

  /* Create storage equipment in a room and derive its initial locationPath. */
  async createEquipment(input: CreateStorageEquipmentInput, userId: string): Promise<StorageEquipment> {
    void userId
    const room = await getRequiredRoom(input.parentId)
    const equipmentDocumentId = generateInventoryId('equipment')
    const equipmentSlug = generateInventoryId('eqp')

    const now = new Date().toISOString()
    const equipmentDocument: Omit<StorageEquipment, '_id' | '_rev'> = {
      type: 'storageEquipment',
      schema: 1,
      slug: equipmentSlug,
      equipmentType: input.equipmentType,
      name: input.name,
      label: input.label?.trim() || null,
      description: input.description ?? null,
      parent: toParentRef(room),
      locationPath: buildLocationPath(room),
      position: input.position ?? null,
      rows: input.rows ?? null,
      columns: input.columns ?? null,
      levels: input.levels ?? null,
      temperatureCelsius: input.temperatureCelsius ?? null,
      capacity: input.capacity ?? null,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      isActive: input.isActive ?? true,
      actionLog: [],
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

  /* List all equipment that belongs to one room. */
  async getEquipmentByRoom(roomDocumentId: string): Promise<StorageEquipment[]> {
    const equipment = await couchDB.queryDocuments<StorageEquipment>({
      'type': 'storageEquipment',
      'parent.id': roomDocumentId,
      'parent.type': 'room'
    })
    return equipment.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Update equipment attributes and cascade path changes to all descendants. */
  async updateEquipment(
    equipmentDocumentId: string,
    rev: string,
    updates: UpdateStorageEquipmentInput,
    userId: string
  ): Promise<StorageEquipment> {
    void userId
    const existing = await getRequiredEquipment(equipmentDocumentId)
    if (existing._rev !== rev) {
      throw new Error('Storage equipment revision conflict.')
    }

    const now = new Date().toISOString()

    const updatedEquipment: StorageEquipment = {
      ...existing,
      schema: 1,
      equipmentType: updates.equipmentType ?? existing.equipmentType,
      name: updates.name ?? existing.name,
      label: updates.label !== undefined ? (updates.label?.trim() || null) : existing.label,
      description: updates.description !== undefined ? updates.description : existing.description,
      position: updates.position !== undefined ? updates.position : existing.position,
      rows: updates.rows !== undefined ? updates.rows : existing.rows,
      columns: updates.columns !== undefined ? updates.columns : existing.columns,
      levels: updates.levels !== undefined ? updates.levels : existing.levels,
      temperatureCelsius: updates.temperatureCelsius !== undefined ? updates.temperatureCelsius : existing.temperatureCelsius,
      capacity: updates.capacity !== undefined ? updates.capacity : existing.capacity,
      manufacturer: updates.manufacturer !== undefined ? updates.manufacturer : existing.manufacturer,
      model: updates.model !== undefined ? updates.model : existing.model,
      serialNumber: updates.serialNumber !== undefined ? updates.serialNumber : existing.serialNumber,
      isActive: updates.isActive ?? existing.isActive,
      updatedAt: now
    }

    const result = await couchDB.updateDocument(updatedEquipment._id, updatedEquipment, rev)
    updatedEquipment._rev = result.rev

    return updatedEquipment
  },

  /* Delete equipment only when no direct child containers/items remain. */
  async deleteEquipment(equipmentDocumentId: string, rev: string): Promise<void> {
    const children = await couchDB.queryDocuments<{ _id: string }>({
      'parent.id': equipmentDocumentId,
      'type': { $in: ['container', 'inventoryItem'] }
    })

    if (children.length > 0) {
      throw new Error(`Cannot delete equipment "${equipmentDocumentId}" because it still contains child inventory.`)
    }

    await couchDB.deleteDocument(equipmentDocumentId, rev)
  },

  /* Move equipment to another room and cascade descendant location paths. */
  async moveEquipmentToRoom(equipmentDocumentId: string, newRoomId: string, userId: string): Promise<StorageEquipment> {
    const equipment = await getRequiredEquipment(equipmentDocumentId)
    const targetRoom = await getRequiredRoom(newRoomId)
    const now = new Date().toISOString()
    const nextLocationPath = buildLocationPath(targetRoom)

    const movedEquipment: StorageEquipment = {
      ...equipment,
      schema: 1,
      parent: toParentRef(targetRoom),
      locationPath: nextLocationPath,
      actionLog: [
        ...(equipment.actionLog ?? []),
        {
          actionType: 'move',
          userId,
          timestamp: now,
          fromParentId: equipment.parent.id,
          toParentId: targetRoom._id
        }
      ],
      updatedAt: now
    }

    const result = await couchDB.updateDocument(movedEquipment._id, movedEquipment, equipment._rev)
    movedEquipment._rev = result.rev

    await cascadeLocationPathUpdate(movedEquipment._id, 'storageEquipment', [
      ...nextLocationPath,
      {
        id: movedEquipment._id,
        type: 'storageEquipment'
      }
    ])

    return movedEquipment
  }
}
