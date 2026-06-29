/*
 * Inventory Room Service - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isRoom(doc) - Check whether a fetched document is a Room
 * ensureUniqueRoomSlug(roomSlug, currentId?) - Prevent duplicate room slugs
 * getRequiredRoom(roomDocumentId) - Load room or throw
 *
 * LISTING ROOMS:
 * getRoom(roomDocumentId) - Fetch one room by document ID
 * getRoomBySlug(slug) - Fetch one room by slug
 * getAllRooms() - List and sort all rooms
 * CREATE, UPDATE, DELETE ROOMS:
 * createRoom(input) - Create a room document
 * updateRoom(roomDocumentId, rev, updates) - Update room fields and cascade path updates
 * deleteRoom(slug) - Delete an empty room
 */

import { couchDB, generateCouchDocId } from '../../database/couchdb'
import type { Room, StorageEquipment } from '../../../types/inventory'
import type { CreateRoomInput, UpdateRoomInput, DeleteRoomInput } from '../../../schemas/inventory/inventory-rooms.ts'

/* Check if a document is a Room document. */
function isRoom(doc: unknown): doc is Room {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const candidate = doc as Partial<Room>
  return candidate.type === 'room'
}

/* Enforce uniqueness for the human-readable room slug. */
async function ensureUniqueRoomSlug(roomSlug: string, currentId?: string): Promise<void> {
  const existing = await couchDB.queryDocuments<Room>({ type: 'room', slug: roomSlug })
  const conflict = existing.find(room => room._id !== currentId)
  if (conflict) {
    throw new Error(`Room slug "${roomSlug}" already exists.`)
  }
}

/* Build the room URL slug from required location attributes. */
function buildRoomSlug(building: Room['building'], floor: number, roomNumber: number): string {
  const buildingFirstChar = building.charAt(0).toUpperCase()
  return `${buildingFirstChar}${floor}${roomNumber}`
}

export const RoomService = {

  /* Fetch one room by document ID. */
  async getRoom(roomDocumentId: string): Promise<Room | null> {
    const room = await couchDB.getDocument<Room>(roomDocumentId)
    return isRoom(room) ? room : null
  },

  /* Fetch room by slug. */
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

  /* Create a room and initialize metadata defaults. */
  async createRoom(input: CreateRoomInput): Promise<Room> {
    const roomSlug = buildRoomSlug(input.building, input.floor, input.roomNumber)
    await ensureUniqueRoomSlug(roomSlug)
    const now = new Date().toISOString()
    const roomDocument: Omit<Room, '_id' | '_rev'> = {
      type: 'room',
      schema: 1,
      slug: roomSlug,
      name: input.name,
      label: input.label ?? null,
      roomNumber: input.roomNumber,
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
      _id: generateCouchDocId('room')
    })

    const room = await couchDB.getDocument<Room>(created.id)
    if (!isRoom(room)) {
      throw new Error('Failed to load room after creation.')
    }
    return room
  },

  /* Update room fields and propagate locationPath changes to descendants. */
  async updateRoom(updates: UpdateRoomInput): Promise<Room> {
    const existing = await RoomService.getRoomBySlug(updates.slug)
    if (!existing) {
      throw new Error('Room to update not found.')
    }

    const shouldRegenerateRoomSlug
      = updates.roomNumber !== undefined || updates.building !== undefined || updates.floor !== undefined

    let nextRoomSlug = existing.slug
    if (shouldRegenerateRoomSlug) {
      const nextRoomNumber = updates.roomNumber ?? existing.roomNumber
      const nextBuilding = updates.building ?? existing.building
      const nextFloor = updates.floor ?? existing.floor
      nextRoomSlug = buildRoomSlug(nextBuilding, nextFloor, nextRoomNumber)
      if (nextRoomSlug !== existing.slug) {
        await ensureUniqueRoomSlug(nextRoomSlug, existing._id)
      }
    }

    const updatedRoom: Room = {
      ...existing, ...updates, slug: nextRoomSlug, updatedAt: new Date().toISOString()
    }

    const result = await couchDB.updateDocument(existing._id, updatedRoom, existing._rev)
    updatedRoom._rev = result.rev

    return updatedRoom
  },

  /* Delete a room only when no storage equipment remains inside it. */
  async deleteRoom(roomsToDelete: DeleteRoomInput): Promise<Room[]> {
    const deletedRooms: Room[] = []
    for (const roomSlug of roomsToDelete.slug) {
      const room = await RoomService.getRoomBySlug(roomSlug)
      if (!room) {
        continue // Skip deletion if the room does not exist
      }

      const equipmentInRoom = await couchDB.queryDocuments<StorageEquipment>({
        'type': 'storageEquipment',
        'room.id': room._id
      })
      if (equipmentInRoom.length > 0) {
        throw new Error(`Cannot delete room "${roomSlug}" because it still contains storage equipment.`)
      }

      await couchDB.deleteDocument(room._id, room._rev)
      deletedRooms.push(room)
    }
    return deletedRooms
  }

}
