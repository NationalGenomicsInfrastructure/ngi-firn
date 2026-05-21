import { z } from 'zod'
import {
  gridPositionSchema,
  inventoryActionTypeSchema,
  inventoryTaskStatusSchema,
  inventoryTaskTargetTypeSchema,
  inventoryLocationTypeSchema
} from './inventory-common'

// Task CRUD schemas

export const createTaskSchema = z.object({
  actionType: inventoryActionTypeSchema,
  status: inventoryTaskStatusSchema.optional(),
  targetId: z.string().min(1, { message: 'Target entity ID is required' }),
  targetType: inventoryTaskTargetTypeSchema,
  assignedTo: z.string().nullish(),
  dueAt: z.string().nullish(),
  fromParentId: z.string().nullish(),
  fromParentType: inventoryLocationTypeSchema.nullish(),
  toParentId: z.string().nullish(),
  toParentType: inventoryLocationTypeSchema.nullish(),
  fromPosition: gridPositionSchema.nullish(),
  toPosition: gridPositionSchema.nullish(),
  linkedTaskId: z.string().nullish(),
  description: z.string().nullish(),
  notes: z.string().nullish()
})

// Task lifecycle schemas

export const completeTaskSchema = z.object({
  taskId: z.string().min(1, { message: 'Task ID is required' }),
  notes: z.string().optional()
})

export const skipTaskSchema = z.object({
  taskId: z.string().min(1, { message: 'Task ID is required' }),
  reason: z.string().optional()
})

export const cancelTaskSchema = z.object({
  taskId: z.string().min(1, { message: 'Task ID is required' })
})

// Task query schemas

export const getTasksForTargetSchema = z.object({
  targetId: z.string().min(1, { message: 'Target ID is required' }),
  limit: z.number().int().min(1).max(500).optional()
})

export const getPlannedTasksSchema = z.object({
  assignedTo: z.string().optional(),
  targetId: z.string().optional(),
  actionType: inventoryActionTypeSchema.optional(),
  overdueBefore: z.string().optional()
})

export const createExpiryTasksSchema = z.object({
  beforeDate: z.string().min(1, { message: 'Expiry cutoff date is required' })
})

// Inferred types
export type CreateTaskSchemaInput = z.infer<typeof createTaskSchema>
export type CompleteTaskSchemaInput = z.infer<typeof completeTaskSchema>
export type SkipTaskSchemaInput = z.infer<typeof skipTaskSchema>
export type CancelTaskSchemaInput = z.infer<typeof cancelTaskSchema>
export type GetTasksForTargetSchemaInput = z.infer<typeof getTasksForTargetSchema>
export type GetPlannedTasksSchemaInput = z.infer<typeof getPlannedTasksSchema>
export type CreateExpiryTasksSchemaInput = z.infer<typeof createExpiryTasksSchema>
