import { z } from 'zod'
// Storage equipment schemas

import { containerTypeSchema } from './container'

export const equipmentTypeSchema = z.enum([
  'Cabinet',
  'Dewar',
  'Freezer',
  'Fridge',
  'Incubator',
  'LabBench',
  'NitrogenTank',
  'ShelvingUnit',
  'Other'
])

export type EquipmentType = z.infer<typeof equipmentTypeSchema>

// Wire/form shape: how many containers of a given type can be stored within a parent container or storage equipment.
export const equipmentCapacitySchema = z.object({
  type: containerTypeSchema,
  capacity: z.number().int().min(0)
})

export type EquipmentCapacity = z.infer<typeof equipmentCapacitySchema>

// Stored document shape: the wire shape plus the server-owned `stored` occupancy counter.
// `stored` is deliberately REQUIRED so that raw client input ({ type, capacity }) is not
// structurally assignable to the stored shape — the compiler rejects storing it unconverted.
// `stored` is never accepted from the client; only the CRUD service writes it.
export const equipmentCapacityEntrySchema = equipmentCapacitySchema.extend({
  stored: z.number().int().min(0)
})

export type EquipmentCapacityEntry = z.infer<typeof equipmentCapacityEntrySchema>

export const createEquipmentSchema = z.object({
  parentSlug: z.string().min(1, { message: 'Parent room identifier is required' }),
  equipmentType: equipmentTypeSchema,
  name: z.string().min(1, { message: 'Equipment name is required' }),
  label: z.string().nullish(),
  description: z.string().nullish(),
  capacity: z.array(equipmentCapacitySchema).nullish(),
  temperatureCelsius: z.number().nullish(),
  temperatureSensorId: z.array(z.string()).nullish(),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  serialNumber: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const updateEquipmentSchema = z.object({
  parentSlug: z.string().optional(),
  equipmentSlug: z.string().min(1, { message: 'Equipment identifier is required' }),
  equipmentType: equipmentTypeSchema.optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  capacity: z.array(equipmentCapacitySchema).optional(),
  temperatureCelsius: z.number().optional(),
  temperatureSensorId: z.array(z.string()).optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  isActive: z.boolean().optional()
})

export const deleteEquipmentSchema = z.object({
  equipmentSlug: z.string().min(1, { message: 'Equipment identifier is required' })
})

export const moveEquipmentSchema = z.object({
  equipmentSlug: z.string().min(1, { message: 'Equipment identifier is required' }),
  newRoomSlug: z.string().min(1, { message: 'Target room identifier is required' })
})

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>
export type DeleteEquipmentInput = z.infer<typeof deleteEquipmentSchema>
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>
export type MoveEquipmentInput = z.infer<typeof moveEquipmentSchema>
