/*
 * LocationService - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isRoom(doc) - Check whether a fetched document is a Room
 * isStorageEquipment(doc) - Check whether a fetched document is StorageEquipment
 * ensureUniqueRoomSlug(roomSlug, currentId?) - Prevent duplicate room slugs
 * ensureUniqueEquipmentId(equipmentId, currentId?) - Prevent duplicate equipment business IDs
 * getRequiredRoom(roomDocumentId) - Load room or throw
 * getRequiredEquipment(equipmentId) - Load equipment or throw
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
 * getEquipment(equipmentId) - Fetch one equipment document by ID
 * getEquipmentByRoom(roomDocumentId) - List equipment in a room
 * updateEquipment(equipmentId, rev, updates, userId) - Update equipment and cascade path updates
 * deleteEquipment(equipmentId, rev) - Delete equipment when empty
 * moveEquipmentToRoom(equipmentId, newRoomId, userId) - Re-home equipment to another room
 */

import { couchDB } from '../database/couchdb'
import {
  buildLocationPath,
  cascadeLocationPathUpdate,
  generateInventoryId
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
  const existing = await couchDB.queryDocuments<Room>({ type: 'room', roomId: roomSlug })
  const conflict = existing.find(room => room._id !== currentId)
  if (conflict) {
    throw new Error(`Room slug "${roomSlug}" already exists.`)
  }
}

/* Enforce uniqueness for the human-readable equipment ID. */
async function ensureUniqueEquipmentId(equipmentId: string, currentId?: string): Promise<void> {
  const existing = await couchDB.queryDocuments<StorageEquipment>({ type: 'storageEquipment', equipmentId })
  const conflict = existing.find(equipment => equipment._id !== currentId)
  if (conflict) {
    throw new Error(`Equipment ID "${equipmentId}" already exists.`)
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
async function getRequiredEquipment(equipmentId: string): Promise<StorageEquipment> {
  const equipment = await couchDB.getDocument<StorageEquipment>(equipmentId)
  if (!isStorageEquipment(equipment)) {
    throw new Error(`Storage equipment "${equipmentId}" was not found.`)
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
      roomId: roomSlug,
      name: input.name,
      label: input.label,
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
    const rooms = await couchDB.queryDocuments<Room>({ type: 'room', roomId: roomSlug })
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

    let nextRoomSlug = existing.roomId
    if (shouldRegenerateRoomSlug) {
      if (nextRoomNumber == null || nextFloor == null) {
        throw new Error('Room number and floor are required to generate the room slug.')
      }
      nextRoomSlug = buildRoomSlug(nextBuilding, nextFloor, nextRoomNumber)
      if (nextRoomSlug !== existing.roomId) {
        await ensureUniqueRoomSlug(nextRoomSlug, existing._id)
      }
    }

    const updatedRoom: Room = {
      ...existing,
      roomId: nextRoomSlug,
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
      type: 'storageEquipment',
      parentId: roomDocumentId
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
    await ensureUniqueEquipmentId(input.equipmentId)

    const now = new Date().toISOString()
    const equipmentDocument: Omit<StorageEquipment, '_id' | '_rev'> = {
      type: 'storageEquipment',
      schema: 1,
      equipmentId: input.equipmentId,
      equipmentType: input.equipmentType,
      name: input.name,
      label: input.label,
      description: input.description ?? null,
      parentId: room._id,
      parentType: 'room',
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
      _id: generateInventoryId('equipment')
    })

    const equipment = await couchDB.getDocument<StorageEquipment>(created.id)
    if (!isStorageEquipment(equipment)) {
      throw new Error('Failed to load storage equipment after creation.')
    }
    return equipment
  },

  /* Fetch one equipment document by document ID. */
  async getEquipment(equipmentId: string): Promise<StorageEquipment | null> {
    const equipment = await couchDB.getDocument<StorageEquipment>(equipmentId)
    return isStorageEquipment(equipment) ? equipment : null
  },

  /* List all equipment that belongs to one room. */
  async getEquipmentByRoom(roomDocumentId: string): Promise<StorageEquipment[]> {
    const equipment = await couchDB.queryDocuments<StorageEquipment>({
      type: 'storageEquipment',
      parentId: roomDocumentId,
      parentType: 'room'
    })
    return equipment.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Update equipment attributes and cascade path changes to all descendants. */
  async updateEquipment(
    equipmentId: string,
    rev: string,
    updates: UpdateStorageEquipmentInput,
    userId: string
  ): Promise<StorageEquipment> {
    void userId
    const existing = await getRequiredEquipment(equipmentId)
    if (existing._rev !== rev) {
      throw new Error('Storage equipment revision conflict.')
    }

    const nextEquipmentId = updates.equipmentId ?? existing.equipmentId
    if (nextEquipmentId !== existing.equipmentId) {
      await ensureUniqueEquipmentId(nextEquipmentId, existing._id)
    }

    const targetRoomId = updates.parentId ?? existing.parentId
    const targetRoom = await getRequiredRoom(targetRoomId)
    const updatedLocationPath = buildLocationPath(targetRoom)
    const now = new Date().toISOString()

    const updatedEquipment: StorageEquipment = {
      ...existing,
      equipmentId: nextEquipmentId,
      equipmentType: updates.equipmentType ?? existing.equipmentType,
      name: updates.name ?? existing.name,
      label: updates.label ?? existing.label,
      description: updates.description !== undefined ? updates.description : existing.description,
      parentId: targetRoom._id,
      parentType: 'room',
      locationPath: updatedLocationPath,
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

    await cascadeLocationPathUpdate(updatedEquipment._id, 'storageEquipment', [
      ...updatedLocationPath,
      {
        id: updatedEquipment._id,
        type: 'storageEquipment'
      }
    ])

    return updatedEquipment
  },

  /* Delete equipment only when no direct child containers/items remain. */
  async deleteEquipment(equipmentId: string, rev: string): Promise<void> {
    const children = await couchDB.queryDocuments<{ _id: string }>({
      parentId: equipmentId,
      type: { $in: ['container', 'inventoryItem'] }
    })

    if (children.length > 0) {
      throw new Error(`Cannot delete equipment "${equipmentId}" because it still contains child inventory.`)
    }

    await couchDB.deleteDocument(equipmentId, rev)
  },

  /* Move equipment to another room using the standard update flow. */
  async moveEquipmentToRoom(equipmentId: string, newRoomId: string, userId: string): Promise<StorageEquipment> {
    const equipment = await getRequiredEquipment(equipmentId)
    return this.updateEquipment(
      equipmentId,
      equipment._rev,
      {
        id: equipmentId,
        rev: equipment._rev,
        parentId: newRoomId,
        parentType: 'room'
      },
      userId
    )
  }
}
