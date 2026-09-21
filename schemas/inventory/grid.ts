import { z } from 'zod'

export const gridPositionSchema = z.object({
  row: z.number().int().min(1),
  column: z.number().int().min(1),
  level: z.number().int().min(1).optional(),
  label: z.string().optional()
})

export type GridPositionInput = z.infer<typeof gridPositionSchema>
