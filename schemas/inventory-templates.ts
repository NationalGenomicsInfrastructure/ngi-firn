import { z } from 'zod'
import {
  gridPositionSchema,
  idRevSchema,
  templateForSchema
} from './inventory-common'

// Template CRUD schemas

export const createTemplateSchema = z.object({
  name: z.string().min(1, { message: 'Template name is required' }),
  description: z.string().nullish(),
  templateFor: templateForSchema,
  defaultCategory: z.string().nullish(),
  defaultClassification: z.string().nullish(),
  capacity: z.number().int().min(1).nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  reservedPositions: z.array(gridPositionSchema).optional(),
  acceptedItemCategories: z.array(z.string()).nullish(),
  acceptedContainerCategories: z.array(z.string()).nullish(),
  defaultColor: z.string().nullish(),
  defaultUnit: z.string().nullish(),
  defaultConcentrationUnit: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  isActive: z.boolean().optional()
})

export const updateTemplateSchema = idRevSchema.extend({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  templateFor: templateForSchema.optional(),
  defaultCategory: z.string().nullish(),
  defaultClassification: z.string().nullish(),
  capacity: z.number().int().min(1).nullish(),
  rows: z.number().int().min(1).nullish(),
  columns: z.number().int().min(1).nullish(),
  levels: z.number().int().min(1).nullish(),
  reservedPositions: z.array(gridPositionSchema).optional(),
  acceptedItemCategories: z.array(z.string()).nullish(),
  acceptedContainerCategories: z.array(z.string()).nullish(),
  defaultColor: z.string().nullish(),
  defaultUnit: z.string().nullish(),
  defaultConcentrationUnit: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  isActive: z.boolean().optional()
})

export const deleteTemplateSchema = idRevSchema

export const applyTemplateSchema = z.object({
  templateId: z.string().min(1, { message: 'Template ID is required' })
})

export const getTemplatesSchema = z.object({
  templateFor: templateForSchema.optional()
})

// Inferred types
export type CreateTemplateSchemaInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateSchemaInput = z.infer<typeof updateTemplateSchema>
export type ApplyTemplateSchemaInput = z.infer<typeof applyTemplateSchema>
export type GetTemplatesSchemaInput = z.infer<typeof getTemplatesSchema>
