/*
 * Inventory Room Service - Table of Contents
 * **********************************
 *
 * TYPE GUARDS AND VALIDATION:
 * isRoom(doc) - Check whether a fetched document is a Room
 * ensureUniqueRoomSlug(roomSlug, currentId?) - Prevent duplicate room slugs
 * buildRoomSlug(building, floor, roomNumber) - Build the room URL slug from required location attributes
 *
 * LISTING ROOMS:
 * getRoom(roomDocumentId) - Fetch one room by document ID
 * getRoomBySlug(slug) - Fetch one room by slug
 * getAllRooms() - List and sort all rooms
 *
 * CREATE, UPDATE, DELETE ROOMS:
 * createRoom(input) - Create a room document
 * updateRoom(updates) - Update room fields and regenerate slug when location attributes change
 * deleteRoom(roomsToDelete) - Delete empty rooms (accepts multiple slugs)
 *
 * TYPE CONVERSION:
 * convertToDisplayRoom(room) - Strip CouchDB-internal fields before sending to the client
 */

import { couchDB, generateCouchDocId } from '../../database/couchdb'
import { hasDirectChildren } from './relations.server'
import type { Room, DisplayRoom } from '../../../types/inventory'
import type { CreateRoomInput, UpdateRoomInput, DeleteRoomInput } from '../../../schemas/inventory/rooms'

/* Check if a document is a Room document. */
function isRoom(doc: unknown): doc is Room {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const candidate = doc as Partial<Room>
  return candidate.type === 'room'
}

/* Query room documents by [type, slug] using the inventory view index. */
async function queryRoomsBySlug(roomSlug: string): Promise<Room[]> {
  const result = await couchDB.queryView<[string, string], null, Room>(
    'firn-inventory',
    'by_slug',
    {
      key: ['room', roomSlug],
      include_docs: true,
      reduce: false
    }
  )

  return result.rows
    .map(row => row.doc)
    .filter((doc): doc is Room => isRoom(doc))
}

/* Query all room documents by type using the inventory view index. */
async function queryAllRoomsByType(): Promise<Room[]> {
  const result = await couchDB.queryView<string, null, Room>(
    'firn-inventory',
    'by_type',
    {
      key: 'room',
      include_docs: true,
      reduce: false
    }
  )

  return result.rows
    .map(row => row.doc)
    .filter((doc): doc is Room => isRoom(doc))
}

/* Enforce uniqueness for the human-readable room slug. */
async function ensureUniqueRoomSlug(roomSlug: string, currentId?: string): Promise<void> {
  const existing = await queryRoomsBySlug(roomSlug)
  const conflict = existing.find(room => room._id !== currentId)
  if (conflict) {
    throw new Error(`A room with the identifier "${roomSlug}" already exists. Please check if the room number is correct or if the room has already been registered.`)
  }
}

/* Build the room URL slug from required location attributes. */
function buildRoomSlug(building: Room['building'], floor: number, roomNumber: number): string {
  const buildingFirstChar = building.charAt(0).toUpperCase()
  return `${buildingFirstChar}${floor}${roomNumber}`
}

export const RoomService = {

  /* Type guard — exposed so cross-service code can validate batch-fetched Room documents. */
  isRoomPublic: isRoom,

  /* Fetch one room by document ID. */
  async getRoom(roomDocumentId: string): Promise<Room | null> {
    const room = await couchDB.getDocument<Room>(roomDocumentId)
    return isRoom(room) ? room : null
  },

  /* Fetch room by slug. */
  async getRoomBySlug(roomSlug: string): Promise<Room | null> {
    const rooms = await queryRoomsBySlug(roomSlug)
    const room = rooms[0]
    return room && isRoom(room) ? room : null
  },

  /* Return all rooms in a stable, name-sorted order. */
  async getAllRooms(): Promise<Room[]> {
    const rooms = await queryAllRoomsByType()
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
      ...existing,
      ...updates,
      slug: nextRoomSlug,
      // Optional text fields are absent when not edited (partial update) and
      // null when cleared; only overwrite the stored value when one is provided.
      label: updates.label === undefined ? existing.label : updates.label,
      description: updates.description === undefined ? existing.description : updates.description,
      updatedAt: new Date().toISOString()
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

      const roomHasChildren = await hasDirectChildren(room._id)
      if (roomHasChildren) {
        throw new Error(`Cannot delete room "${roomSlug}" because it still contains storage equipment.`)
      }

      await couchDB.deleteDocument(room._id, room._rev)
      deletedRooms.push(room)
    }
    return deletedRooms
  },

  /* Strip CouchDB-internal fields before sending a Room to the client. */
  convertToDisplayRoom(room: Room): DisplayRoom {
    return {
      slug: room.slug,
      name: room.name,
      label: room.label,
      roomType: room.roomType,
      building: room.building,
      floor: room.floor,
      roomNumber: room.roomNumber,
      description: room.description,
      isActive: room.isActive,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    }
  }

}
