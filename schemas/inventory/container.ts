import { z } from 'zod'

// Container type classifications
export const containerTypeSchema = z.enum([
  'rack',
  'box',
  'bag',
  'tray',
  'other'
])

export type ContainerType = z.infer<typeof containerTypeSchema>
