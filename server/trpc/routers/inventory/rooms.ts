/*
 * Inventory Rooms Router - Table of Contents
 * **********************************************
 *
 * ROOM QUERIES (authedProcedure):
 * getAllRooms - List all rooms sorted by name
 * getRoomBySlug - Fetch a single room by slug
 *
 * ROOM MUTATIONS (authedProcedure):
 * createRoom - Create a new room
 * updateRoom - Update room fields
 *
 * ROOM MUTATIONS (adminProcedure):
 * deleteRoom - Delete an empty room (cascading risk)
 *
 */

import { createTRPCRouter, authedProcedure, adminProcedure } from '../../init'
import { z } from 'zod'
import {
  createRoomSchema,
  updateRoomSchema,
  deleteRoomSchema
} from '~~/schemas/inventory/rooms'
import type { DisplayRoom } from '~~/types/inventory'

export const roomsRouter = createTRPCRouter({

  // Room queries

  getAllRooms: authedProcedure
    .query(async (): Promise<DisplayRoom[]> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      const rooms = await RoomService.getAllRooms()
      return rooms.map(room => RoomService.convertToDisplayRoom(room))
    }),

  // getRoom - Fetch a single room by document ID is deliberately omitted from the API. Use getRoomBySlug instead.
  // Document IDs are internal CouchDB identifiers and should never be exposed through the API.

  getRoomBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayRoom | null> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      const room = await RoomService.getRoomBySlug(input.slug)
      return room ? RoomService.convertToDisplayRoom(room) : null
    }),

  // Room mutations

  createRoom: authedProcedure
    .input(createRoomSchema)
    .mutation(async ({ input }): Promise<DisplayRoom> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      const room = await RoomService.createRoom(input)
      return RoomService.convertToDisplayRoom(room)
    }),

  updateRoom: authedProcedure
    .input(updateRoomSchema)
    .mutation(async ({ input }): Promise<DisplayRoom> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      const room = await RoomService.updateRoom(input)
      return RoomService.convertToDisplayRoom(room)
    }),

  deleteRoom: adminProcedure
    .input(deleteRoomSchema)
    .mutation(async ({ input }): Promise<DisplayRoom[]> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      const rooms = await RoomService.deleteRoom(input)
      return rooms.map(room => RoomService.convertToDisplayRoom(room))
    })

})
