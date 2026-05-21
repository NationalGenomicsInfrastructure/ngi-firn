import { z } from 'zod'
import {
  gridPositionSchema,
  idRevSchema,
  containerTypeSchema,
  containerClassificationSchema,
  inventoryLocationTypeSchema
} from './inventory-common'

// Container schemas

export const createContainerSchema = z.object({
  containerId: z.string().min(1, { message: 'Container ID is required' }),
  containerType: containerTypeSchema,
  classification: containerClassificationSchema,
  name: z.string().min(1, { message: 'Container name is required' }),
  label: z.string().min(1, { message: 'Container label is required' }),
  description: z.string().nullish(),
  parentId: z.string().min(1, { message: 'Parent ID is required' }),
  parentType: inventoryLocationTypeSchema.exclude(['room']),
  position: gridPositionSchema.nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  capacity: z.number().int().min(1).nullish(),
  acceptedItemCategories: z.array(z.string()).nullish(),
  acceptedContainerCategories: z.array(z.string()).nullish(),
  templateId: z.string().nullish(),
  color: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const updateContainerSchema = idRevSchema.extend({
  containerId: z.string().min(1).optional(),
  containerType: containerTypeSchema.optional(),
  classification: containerClassificationSchema.optional(),
  name: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullish(),
  position: gridPositionSchema.nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  capacity: z.number().int().min(1).nullish(),
  acceptedItemCategories: z.array(z.string()).nullish(),
  acceptedContainerCategories: z.array(z.string()).nullish(),
  templateId: z.string().nullish(),
  color: z.string().nullish(),
  isActive: z.boolean().optional()
})

export const deleteContainerSchema = idRevSchema

export const moveContainerSchema = z.object({
  containerId: z.string().min(1, { message: 'Container ID is required' }),
  newParentId: z.string().min(1, { message: 'Target parent ID is required' }),
  newParentType: inventoryLocationTypeSchema.exclude(['room']),
  position: gridPositionSchema.nullish()
})

// Inferred types
export type CreateContainerSchemaInput = z.infer<typeof createContainerSchema>
export type UpdateContainerSchemaInput = z.infer<typeof updateContainerSchema>
export type MoveContainerSchemaInput = z.infer<typeof moveContainerSchema>
