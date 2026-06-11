/*
 * Inventory Locations Router - Table of Contents
 * **********************************************
 *
 * ROOM QUERIES (authedProcedure):
 * getAllRooms - List all rooms sorted by name
 * getRoom - Fetch a single room by document ID
 * getRoomBySlug - Fetch a single room by slug
 *
 * ROOM MUTATIONS (authedProcedure):
 * createRoom - Create a new room
 * updateRoom - Update room fields
 *
 * ROOM MUTATIONS (adminProcedure):
 * deleteRoom - Delete an empty room (cascading risk)
 *
 * EQUIPMENT QUERIES (authedProcedure):
 * getAllEquipment - List all storage equipment across all rooms
 * getEquipment - Fetch a single equipment document by ID
 * getEquipmentByRoom - List equipment in a room
 * getEquipmentDescendants - Return all containers/items beneath an equipment (flat)
 *
 * EQUIPMENT MUTATIONS (authedProcedure):
 * createEquipment - Create storage equipment within a room
 * updateEquipment - Update equipment fields
 * moveEquipmentToRoom - Move equipment to a different room
 *
 * EQUIPMENT MUTATIONS (adminProcedure):
 * deleteEquipment - Delete equipment (cascading risk)
 */

import { createTRPCRouter, authedProcedure, adminProcedure } from '../../init'
import { z } from 'zod'
import {
  createRoomSchema,
  updateRoomSchema,
  deleteRoomSchema,
  createEquipmentSchema,
  updateEquipmentSchema,
  deleteEquipmentSchema,
  moveEquipmentSchema
} from '~~/schemas/inventory-locations'
import type { Container, InventoryItem, Room, StorageEquipment } from '~~/types/inventory'

export const locationsRouter = createTRPCRouter({

  // Room queries

  getAllRooms: authedProcedure
    .query(async (): Promise<Room[]> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getAllRooms()
    }),

  getRoom: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }): Promise<Room | null> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getRoom(input.id)
    }),

  getRoomBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<Room | null> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getRoomBySlug(input.slug)
    }),

  // Room mutations

  createRoom: authedProcedure
    .input(createRoomSchema)
    .mutation(async ({ input, ctx }): Promise<Room> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.createRoom(input, ctx.secure!.id)
    }),

  updateRoom: authedProcedure
    .input(updateRoomSchema)
    .mutation(async ({ input, ctx }): Promise<Room> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      const { id, rev } = input
      return LocationService.updateRoom(id, rev, input, ctx.secure!.id)
    }),

  deleteRoom: adminProcedure
    .input(deleteRoomSchema)
    .mutation(async ({ input }): Promise<void> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.deleteRoom(input.id, input.rev)
    }),

  // Equipment queries

  getAllEquipment: authedProcedure
    .query(async (): Promise<StorageEquipment[]> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getAllEquipment()
    }),

  getEquipment: authedProcedure
    .input(z.object({ equipmentId: z.string().min(1) }))
    .query(async ({ input }): Promise<StorageEquipment | null> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getEquipment(input.equipmentId)
    }),

  getEquipmentBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<StorageEquipment | null> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getEquipmentBySlug(input.slug)
    }),

  getEquipmentByRoom: authedProcedure
    .input(z.object({ roomDocumentId: z.string().min(1) }))
    .query(async ({ input }): Promise<StorageEquipment[]> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getEquipmentByRoom(input.roomDocumentId)
    }),

  getEquipmentDescendants: authedProcedure
    .input(z.object({ equipmentId: z.string().min(1) }))
    .query(async ({ input }): Promise<(Container | InventoryItem)[]> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.getEquipmentDescendants(input.equipmentId)
    }),

  // Equipment mutations

  createEquipment: authedProcedure
    .input(createEquipmentSchema)
    .mutation(async ({ input, ctx }): Promise<StorageEquipment> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.createEquipment(input, ctx.secure!.id)
    }),

  updateEquipment: authedProcedure
    .input(updateEquipmentSchema)
    .mutation(async ({ input, ctx }): Promise<StorageEquipment> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      const { id, rev } = input
      return LocationService.updateEquipment(id, rev, input, ctx.secure!.id)
    }),

  moveEquipmentToRoom: authedProcedure
    .input(moveEquipmentSchema)
    .mutation(async ({ input, ctx }): Promise<StorageEquipment> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.moveEquipmentToRoom(input.equipmentId, input.newRoomId, ctx.secure!.id)
    }),

  deleteEquipment: adminProcedure
    .input(deleteEquipmentSchema)
    .mutation(async ({ input }): Promise<void> => {
      const { LocationService } = await import('../../../crud/inventory-locations.server')
      return LocationService.deleteEquipment(input.id, input.rev)
    })
})
