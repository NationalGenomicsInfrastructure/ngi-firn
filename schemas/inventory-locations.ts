import { z } from 'zod'
import {
  gridPositionSchema,
  idRevSchema,
  roomTypeSchema,
  roomBuildingSchema,
  equipmentTypeSchema
} from './inventory-common'

// Room schemas

export const createRoomSchema = z.object({
  name: z.string().min(1, { message: 'Room name is required' }),
  label: z.string().optional(),
  roomNumber: z.string().trim().min(1, { message: 'Room number is required' }),
  roomType: roomTypeSchema,
  building: roomBuildingSchema,
  floor: z.number().int({ message: 'Floor must be an integer' }),
  description: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const updateRoomSchema = idRevSchema.extend({
  name: z.string().min(1).optional(),
  label: z.string().optional(),
  roomNumber: z.string().trim().min(1).optional(),
  roomType: roomTypeSchema.optional(),
  building: roomBuildingSchema.optional(),
  floor: z.number().int({ message: 'Floor must be an integer' }).optional(),
  description: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const deleteRoomSchema = idRevSchema

// Storage equipment schemas

export const createEquipmentSchema = z.object({
  equipmentType: equipmentTypeSchema,
  name: z.string().min(1, { message: 'Equipment name is required' }),
  label: z.string().nullish(),
  description: z.string().nullish(),
  parentId: z.string().min(1, { message: 'Parent room document ID is required' }),
  position: gridPositionSchema.nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  temperatureCelsius: z.number().nullish(),
  capacity: z.number().int().min(1).nullish(),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  serialNumber: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const updateEquipmentSchema = idRevSchema.extend({
  equipmentType: equipmentTypeSchema.optional(),
  name: z.string().min(1).optional(),
  label: z.string().nullish(),
  description: z.string().nullish(),
  position: gridPositionSchema.nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  temperatureCelsius: z.number().nullish(),
  capacity: z.number().int().min(1).nullish(),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  serialNumber: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const deleteEquipmentSchema = idRevSchema

export const moveEquipmentSchema = z.object({
  equipmentId: z.string().min(1, { message: 'Equipment ID is required' }),
  newRoomId: z.string().min(1, { message: 'Target room document ID is required' })
})

// Inferred types
export type CreateRoomSchemaInput = z.infer<typeof createRoomSchema>
export type UpdateRoomSchemaInput = z.infer<typeof updateRoomSchema>
export type CreateEquipmentSchemaInput = z.infer<typeof createEquipmentSchema>
export type UpdateEquipmentSchemaInput = z.infer<typeof updateEquipmentSchema>
export type MoveEquipmentSchemaInput = z.infer<typeof moveEquipmentSchema>
