import { z } from 'zod'

// Room type classifications
export const roomTypeSchema = z.enum([
  'basement',
  'laboratory',
  'office',
  'storage',
  'other'
])

// Allowed building identifiers for room registration
export const SciLifeLabBuildingSchema = z.enum([
  'Alfa',
  'Beta',
  'Gamma',
  'Delta'
])

// Room schemas

export const createRoomSchema = z.object({
  name: z.string().min(1, { message: 'Room name is required' }),
  label: z.string().nullish(),
  roomNumber: z.number().int({ message: 'Enter the room number without building and floor prefix.' }),
  roomType: roomTypeSchema,
  building: SciLifeLabBuildingSchema,
  floor: z.number().int({ message: 'Floor must be an integer' }),
  description: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const updateRoomSchema = z.object({
  // slug fill be derived from the route mostly
  slug: z.string().min(1, { message: 'Room slug is required' }),
  name: z.string().min(1).optional(),
  label: z.string().nullish(),
  roomNumber: z.number().int({ message: 'Enter the room number without building and floor prefix.' }).optional(),
  roomType: roomTypeSchema.optional(),
  building: SciLifeLabBuildingSchema.optional(),
  floor: z.number().int({ message: 'Floor must be an integer' }).optional(),
  description: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const deleteRoomSchema = z.object({
  slug: z.array(z.string())
})

// Type inference from schemas

export type RoomType = z.infer<typeof roomTypeSchema>
export type SciLifeLabBuilding = z.infer<typeof SciLifeLabBuildingSchema>
export type CreateRoomInput = z.infer<typeof createRoomSchema>
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>
export type DeleteRoomInput = z.infer<typeof deleteRoomSchema>
