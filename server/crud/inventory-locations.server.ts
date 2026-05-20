/*
 * LocationService - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isRoom(doc) - Check whether a fetched document is a Room
 * isStorageEquipment(doc) - Check whether a fetched document is StorageEquipment
 * ensureUniqueRoomId(roomId, currentId?) - Prevent duplicate room business IDs
 * ensureUniqueEquipmentId(equipmentId, currentId?) - Prevent duplicate equipment business IDs
 * getRequiredRoom(roomId) - Load room or throw
 * getRequiredEquipment(equipmentId) - Load equipment or throw
 *
 * ROOM CRUD:
 * createRoom(input, userId) - Create a room document
 * getRoom(roomId) - Fetch one room by document ID
 * getAllRooms() - List and sort all rooms
 * updateRoom(roomId, rev, updates, userId) - Update room fields and cascade path updates
 * deleteRoom(roomId, rev) - Delete an empty room
 *
 * STORAGE EQUIPMENT CRUD:
 * createEquipment(input, userId) - Create storage equipment within a room
 * getEquipment(equipmentId) - Fetch one equipment document by ID
 * getEquipmentByRoom(roomId) - List equipment in a room
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

/* Enforce uniqueness for the human-readable room ID. */
async function ensureUniqueRoomId(roomId: string, currentId?: string): Promise<void> {
  const existing = await couchDB.queryDocuments<Room>({ type: 'room', roomId })
  const conflict = existing.find(room => room._id !== currentId)
  if (conflict) {
    throw new Error(`Room ID "${roomId}" already exists.`)
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
async function getRequiredRoom(roomId: string): Promise<Room> {
  const room = await couchDB.getDocument<Room>(roomId)
  if (!isRoom(room)) {
    throw new Error(`Room "${roomId}" was not found.`)
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

export const LocationService = {
  /* Create a room and initialize metadata defaults. */
  async createRoom(input: CreateRoomInput, userId: string): Promise<Room> {
    void userId
    await ensureUniqueRoomId(input.roomId)
    const now = new Date().toISOString()
    const roomDocument: Omit<Room, '_id' | '_rev'> = {
      type: 'room',
      schema: 1,
      roomId: input.roomId,
      name: input.name,
      label: input.label,
      roomNumber: input.roomNumber ?? null,
      roomType: input.roomType,
      building: input.building,
      floor: input.floor ?? null,
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
  async getRoom(roomId: string): Promise<Room | null> {
    const room = await couchDB.getDocument<Room>(roomId)
    return isRoom(room) ? room : null
  },

  /* Return all rooms in a stable, name-sorted order. */
  async getAllRooms(): Promise<Room[]> {
    const rooms = await couchDB.queryDocuments<Room>({ type: 'room' })
    return rooms.sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Update room fields and propagate locationPath changes to descendants. */
  async updateRoom(roomId: string, rev: string, updates: UpdateRoomInput, userId: string): Promise<Room> {
    void userId
    const existing = await getRequiredRoom(roomId)
    if (existing._rev !== rev) {
      throw new Error('Room revision conflict.')
    }

    const nextRoomId = updates.roomId ?? existing.roomId
    if (nextRoomId !== existing.roomId) {
      await ensureUniqueRoomId(nextRoomId, existing._id)
    }

    const updatedRoom: Room = {
      ...existing,
      roomId: nextRoomId,
      name: updates.name ?? existing.name,
      label: updates.label ?? existing.label,
      roomNumber: updates.roomNumber !== undefined ? updates.roomNumber : existing.roomNumber,
      roomType: updates.roomType ?? existing.roomType,
      building: updates.building ?? existing.building,
      floor: updates.floor !== undefined ? updates.floor : existing.floor,
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
  async deleteRoom(roomId: string, rev: string): Promise<void> {
    const equipmentInRoom = await couchDB.queryDocuments<StorageEquipment>({
      type: 'storageEquipment',
      parentId: roomId
    })
    if (equipmentInRoom.length > 0) {
      throw new Error(`Cannot delete room "${roomId}" because it still contains storage equipment.`)
    }

    await couchDB.deleteDocument(roomId, rev)
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
  async getEquipmentByRoom(roomId: string): Promise<StorageEquipment[]> {
    const equipment = await couchDB.queryDocuments<StorageEquipment>({
      type: 'storageEquipment',
      parentId: roomId,
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
