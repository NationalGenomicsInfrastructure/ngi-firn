import { z } from 'zod'
import {
  gridPositionSchema,
  idRevSchema,
  containerTypeSchema,
  containerClassificationSchema,
  documentReferenceMapSchema
} from './inventory-common'

// Container schemas

export const createContainerSchema = z.object({
  containerType: containerTypeSchema,
  classification: containerClassificationSchema,
  name: z.string().min(1, { message: 'Container name is required' }),
  label: z.string().nullish(),
  description: z.string().nullish(),
  parentId: z.string().min(1, { message: 'Parent ID is required' }),
  position: gridPositionSchema.nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  capacity: z.number().int().min(1).nullish(),
  acceptedItemCategories: z.array(z.string()).nullish(),
  acceptedContainerCategories: z.array(z.string()).nullish(),
  templateId: z.string().nullish(),
  color: z.string().nullish(),
  projectRefs: documentReferenceMapSchema.nullish(),
  isActive: z.boolean().optional()
})

export const updateContainerSchema = idRevSchema.extend({
  containerType: containerTypeSchema.optional(),
  classification: containerClassificationSchema.optional(),
  name: z.string().min(1).optional(),
  label: z.string().nullish(),
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
  projectRefs: documentReferenceMapSchema.nullish(),
  isActive: z.boolean().optional()
})

export const deleteContainerSchema = idRevSchema

export const moveContainerSchema = z.object({
  containerId: z.string().min(1, { message: 'Container ID is required' }),
  newParentId: z.string().min(1, { message: 'Target parent ID is required' }),
  position: gridPositionSchema.nullish()
})

export const suggestLocationsSchema = z.object({
  category: z.string().min(1, { message: 'Item/container category is required' }),
  childType: z.enum(['item', 'container']),
  count: z.number().int().positive({ message: 'Requested slot count must be positive' }),
  classification: z.string().nullish(),
  ancestorId: z.string().nullish(),
  temperatureCelsius: z.number().nullish()
})

export const getByProjectSchema = z.object({
  projectId: z.string().min(1, { message: 'Project ID is required' }),
  db: z.string().min(1).default('projects')
})

// Inferred types
export type CreateContainerSchemaInput = z.infer<typeof createContainerSchema>
export type UpdateContainerSchemaInput = z.infer<typeof updateContainerSchema>
export type MoveContainerSchemaInput = z.infer<typeof moveContainerSchema>
export type SuggestLocationsSchemaInput = z.infer<typeof suggestLocationsSchema>
export type GetByProjectSchemaInput = z.infer<typeof getByProjectSchema>
