/*
 * Inventory Equipment Router - Table of Contents
 * ************************************************
 *
 * EQUIPMENT QUERIES (authedProcedure):
 * getAllEquipment - List all storage equipment sorted by name
 * getEquipmentBySlug - Fetch a single equipment document by slug
 * getEquipmentByRoom - List all equipment in a given room
 *
 * EQUIPMENT MUTATIONS (authedProcedure):
 * createEquipment - Create storage equipment inside a room
 * updateEquipment - Update equipment metadata
 * moveEquipmentToRoom - Re-home equipment to a different room
 *
 * EQUIPMENT MUTATIONS (adminProcedure):
 * deleteEquipment - Delete equipment when it is empty
 */

import { createTRPCRouter, authedProcedure, adminProcedure } from '../../init'
import { z } from 'zod'
import {
  createEquipmentSchema,
  updateEquipmentSchema,
  deleteEquipmentSchema,
  moveEquipmentSchema
} from '~~/schemas/inventory/equipment'
import type { DisplayStorageEquipment } from '~~/types/inventory'

export const equipmentRouter = createTRPCRouter({

  // Equipment queries

  getAllEquipment: authedProcedure
    .query(async (): Promise<DisplayStorageEquipment[]> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const equipment = await EquipmentService.getAllEquipment()
      return await EquipmentService.convertMultipleToDisplayStorageEquipment(equipment)
    }),

  getEquipmentBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayStorageEquipment | null> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const equipment = await EquipmentService.getEquipmentBySlug(input.slug)
      if (!equipment) {
        return null
      }
      const display = await EquipmentService.convertMultipleToDisplayStorageEquipment([equipment])
      return display[0] ?? null
    }),

  getEquipmentByRoom: authedProcedure
    .input(z.object({ roomSlug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayStorageEquipment[]> => {
      const { RoomService } = await import('../../../crud/inventory/rooms.server')
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const room = await RoomService.getRoomBySlug(input.roomSlug)
      if (!room) {
        return []
      }
      const equipment = await EquipmentService.getEquipmentByRoom(room._id)
      return await EquipmentService.convertMultipleToDisplayStorageEquipment(equipment)
    }),

  // Equipment mutations

  createEquipment: authedProcedure
    .input(createEquipmentSchema)
    .mutation(async ({ input }): Promise<DisplayStorageEquipment> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const equipment = await EquipmentService.createEquipment(input)
      const display = await EquipmentService.convertMultipleToDisplayStorageEquipment([equipment])
      if (!display[0]) {
        throw new Error('Failed to convert created equipment to display type.')
      }
      return display[0]
    }),

  updateEquipment: authedProcedure
    .input(updateEquipmentSchema)
    .mutation(async ({ input }): Promise<DisplayStorageEquipment> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const equipment = await EquipmentService.updateEquipment(input)
      const display = await EquipmentService.convertMultipleToDisplayStorageEquipment([equipment])
      if (!display[0]) {
        throw new Error('Failed to convert updated equipment to display type.')
      }
      return display[0]
    }),

  moveEquipmentToRoom: authedProcedure
    .input(moveEquipmentSchema)
    .mutation(async ({ input }): Promise<DisplayStorageEquipment> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const equipment = await EquipmentService.moveEquipmentToRoom(input)
      const display = await EquipmentService.convertMultipleToDisplayStorageEquipment([equipment])
      if (!display[0]) {
        throw new Error('Failed to convert moved equipment to display type.')
      }
      return display[0]
    }),

  deleteEquipment: adminProcedure
    .input(deleteEquipmentSchema)
    .mutation(async ({ input }): Promise<DisplayStorageEquipment> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const equipment = await EquipmentService.deleteEquipment(input)
      const display = await EquipmentService.convertMultipleToDisplayStorageEquipment([equipment])
      if (!display[0]) {
        throw new Error('Failed to convert deleted equipment to display type.')
      }
      return display[0]
    })

})
