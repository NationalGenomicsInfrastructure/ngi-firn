import { z } from 'zod'

// Room type classifications
export const roomTypeSchema = z.enum([
  'Basement',
  'Laboratory',
  'Office',
  'Storage',
  'Other'
])

// Allowed building identifiers for room registration
export const SciLifeLabBuildingSchema = z.enum([
  'Alfa',
  'Beta',
  'Gamma',
  'Delta'
])

// Room schemas

// Optional free-text fields are trimmed, and empty/whitespace-only input is
// normalized to null so stored documents never hold empty strings. Omitted
// fields stay absent (the transform only runs on values that are present),
// which keeps update payloads partial.
const optionalRoomText = z.string().trim().nullish().transform(value => (value === '' ? null : value))

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, { message: 'Room name is required' }),
  label: optionalRoomText,
  roomNumber: z.number().int({ message: 'Enter the room number without building and floor prefix.' }),
  roomType: roomTypeSchema,
  building: SciLifeLabBuildingSchema,
  floor: z.number().int({ message: 'Floor must be an integer' }),
  description: optionalRoomText,
  isActive: z.boolean().optional()
})

export const updateRoomSchema = z.object({
  // slug fill be derived from the route mostly
  slug: z.string().min(1, { message: 'Room slug is required' }),
  name: z.string().trim().min(1).optional(),
  label: optionalRoomText,
  roomNumber: z.number().int({ message: 'Enter the room number without building and floor prefix.' }),
  roomType: roomTypeSchema.optional(),
  building: SciLifeLabBuildingSchema,
  floor: z.number().int({ message: 'Floor must be an integer' }),
  description: optionalRoomText,
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
