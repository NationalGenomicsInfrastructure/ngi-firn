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
import type { Room } from '~~/types/inventory'

export const roomsRouter = createTRPCRouter({

  // Room queries

  getAllRooms: authedProcedure
    .query(async (): Promise<Room[]> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      return await RoomService.getAllRooms()
    }),

  // getRoom - Fetch a single room by document ID is deliberately omitted from the API. Use getRoomBySlug instead.
  // Document IDs are internal CouchDB identifiers and should never be exposed through the API.

  getRoomBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<Room | null> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      return await RoomService.getRoomBySlug(input.slug)
    }),

  // Room mutations

  createRoom: authedProcedure
    .input(createRoomSchema)
    .mutation(async ({ input }): Promise<Room> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      return await RoomService.createRoom(input)
    }),

  updateRoom: authedProcedure
    .input(updateRoomSchema)
    .mutation(async ({ input }): Promise<Room> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      return await RoomService.updateRoom(input)
    }),

  deleteRoom: adminProcedure
    .input(deleteRoomSchema)
    .mutation(async ({ input }): Promise<Room[]> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      return await RoomService.deleteRoom(input)
    })

})
