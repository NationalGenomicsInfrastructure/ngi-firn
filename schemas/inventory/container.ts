import { z } from 'zod'

// Container type classifications
export const containerTypeSchema = z.enum([
  'Bag',
  'Bin',
  'Block',
  'Box',
  'Cane',
  'Goblet',
  'Rack',
  'Tray',
  'Other'
])

export type ContainerType = z.infer<typeof containerTypeSchema>

// Wire/form shape: how many containers of a given type can be stored within a parent container.
export const containerCapacitySchema = z.object({
  type: containerTypeSchema,
  capacity: z.number().int().min(0)
})

export type ContainerCapacity = z.infer<typeof containerCapacitySchema>

// Stored document shape: the wire shape plus the server-owned `stored` occupancy counter.
// `stored` is deliberately REQUIRED so that raw client input ({ type, capacity }) is not
// structurally assignable to the stored shape — the compiler rejects storing it unconverted.
// `stored` is never accepted from the client; only the CRUD service writes it.
export const containerCapacityEntrySchema = containerCapacitySchema.extend({
  stored: z.number().int().min(0)
})

export type ContainerCapacityEntry = z.infer<typeof containerCapacityEntrySchema>
