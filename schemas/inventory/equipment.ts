import { z } from 'zod'
// Storage equipment schemas

import { containerTypeSchema } from './container'

export const equipmentType = z.enum([
  'Cabinet',
  'Freezer',
  'Fridge',
  'Shelf',
  'NitrogenTank',
  'Other'
])

export type EquipmentType = z.infer<typeof equipmentType>

// Schema that defines how many containers of a given type can be stored within a parent container or storage equipment
export const equipmentCapacitySchema = z.object({
  type: containerTypeSchema,
  capacity: z.number().int().min(0)
})

type EquipmentCapacity = z.infer<typeof equipmentCapacitySchema>
// Type to store current and maximum counts per container type within storage equipment.
export type EquipmentCapacityCount = Partial<Record<EquipmentCapacity['type'], {
  stored: number
  capacity: EquipmentCapacity['capacity']
}>>

export const createEquipmentSchema = z.object({
  parentSlug: z.string().min(1, { message: 'Parent room identifier is required' }),
  equipmentType: equipmentType,
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
  equipmentType: equipmentType.optional(),
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
