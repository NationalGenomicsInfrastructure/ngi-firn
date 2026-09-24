import { z } from 'zod'
import { gridPositionSchema } from './grid'
import { inventoryActionSchema, inventoryClassificationSchema, inventoryFlagSchema } from './metadata'
import { temperatureCategorySchema } from './temperature'

// Physical item form-factor classifications.
export const itemTypeSchema = z.enum([
  'ampoule',
  'blottingMembrane',
  'bottle',
  'capillary',
  'cassette',
  'conicalTube',
  'cryovial',
  'cuvette',
  'jar',
  'microcentrifugeTube',
  'microscopySlide',
  'pcrStrip',
  'petriDish',
  'plate',
  'spinColumn',
  'vial',
  'other'
])

const itemParentKindSchema = z.enum(['equipment', 'container'])

export const createItemSchema = z.object({
  category: itemTypeSchema,
  classification: inventoryClassificationSchema.nullish(),
  name: z.string().min(1, { message: 'Item name is required' }),
  label: z.string().nullish(),
  description: z.string().nullish(),
  quantity: z.number().nonnegative().nullish(),
  unit: z.string().nullish(),
  concentration: z.number().nonnegative().nullish(),
  concentrationUnit: z.string().nullish(),
  temperatureCategory: temperatureCategorySchema.nullish(),
  temperatureCelsius: z.number().nullish(),
  arrivalDate: z.string().nullish(),
  openingDate: z.string().nullish(),
  expiryDate: z.string().nullish(),
  lotNumber: z.string().nullish(),
  barcode: z.string().nullish(),
  templateId: z.string().nullish(),
  notes: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  parentSlug: z.string().min(1, { message: 'Parent identifier is required' }),
  parentKind: itemParentKindSchema,
  position: gridPositionSchema.nullish(),
  projectIds: z.array(z.string()).nullish()
})

export const updateItemSchema = z.object({
  itemSlug: z.string().min(1, { message: 'Item identifier is required' }),
  classification: inventoryClassificationSchema.nullish(),
  name: z.string().min(1).optional(),
  label: z.string().nullish(),
  description: z.string().nullish(),
  quantity: z.number().nonnegative().nullish(),
  unit: z.string().nullish(),
  concentration: z.number().nonnegative().nullish(),
  concentrationUnit: z.string().nullish(),
  temperatureCategory: temperatureCategorySchema.nullish(),
  temperatureCelsius: z.number().nullish(),
  arrivalDate: z.string().nullish(),
  openingDate: z.string().nullish(),
  expiryDate: z.string().nullish(),
  lotNumber: z.string().nullish(),
  barcode: z.string().nullish(),
  templateId: z.string().nullish(),
  notes: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  logComment: z.string().nullish()
})

export const deleteItemSchema = z.object({
  itemSlug: z.array(z.string().min(1, { message: 'Item identifier is required' }))
    .min(1, { message: 'At least one item identifier is required' })
})

export const moveItemSchema = z.object({
  itemSlug: z.array(z.string().min(1, { message: 'Item identifier is required' }))
    .min(1, { message: 'At least one item identifier is required' }),
  newParentSlug: z.string().min(1, { message: 'Target parent identifier is required' }),
  newParentKind: itemParentKindSchema,
  position: gridPositionSchema.nullish(),
  logComment: z.string().nullish()
}).superRefine((input, ctx) => {
  if (input.position && input.itemSlug.length > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['position'],
      message: 'An explicit position can only be supplied when moving a single item.'
    })
  }
})

export const locateItemSchema = z.object({
  itemSlug: z.array(z.string().min(1, { message: 'Item identifier is required' }))
    .min(1, { message: 'At least one item identifier is required' }),
  newParentSlug: z.string().min(1, { message: 'Target parent identifier is required' }),
  newParentKind: itemParentKindSchema,
  position: gridPositionSchema.nullish(),
  logComment: z.string().nullish()
}).superRefine((input, ctx) => {
  if (input.position && input.itemSlug.length > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['position'],
      message: 'An explicit position can only be supplied when locating a single item.'
    })
  }
})

export const alterItemSchema = z.object({
  itemSlug: z.array(z.string().min(1, { message: 'Item identifier is required' }))
    .min(1, { message: 'At least one item identifier is required' }),
  performedAction: inventoryActionSchema,
  flagKind: inventoryFlagSchema.nullish(),
  logComment: z.string().nullish()
})

export const itemMoveTargetsSchema = z.object({
  itemSlug: z.string().min(1, { message: 'Item identifier is required' }),
  showAllClassifications: z.boolean().optional()
})

export const itemMoveTargetsBatchSchema = z.object({
  itemSlug: z.array(z.string().min(1, { message: 'Item identifier is required' }))
    .min(1, { message: 'At least one item identifier is required' }),
  showAllClassifications: z.boolean().optional()
})

export type ItemType = z.infer<typeof itemTypeSchema>
export type ItemParentKind = z.infer<typeof itemParentKindSchema>
export type CreateItemSchemaInput = z.infer<typeof createItemSchema>
export type CreateItemFormValues = Omit<
  CreateItemSchemaInput,
  'parentSlug' | 'parentKind' | 'position' | 'projectIds'
>
export type UpdateItemSchemaInput = z.infer<typeof updateItemSchema>
export type DeleteItemSchemaInput = z.infer<typeof deleteItemSchema>
export type MoveItemSchemaInput = z.infer<typeof moveItemSchema>
export type LocateItemSchemaInput = z.infer<typeof locateItemSchema>
export type AlterItemSchemaInput = z.infer<typeof alterItemSchema>
export type ItemMoveTargetsSchemaInput = z.infer<typeof itemMoveTargetsSchema>
export type ItemMoveTargetsBatchSchemaInput = z.infer<typeof itemMoveTargetsBatchSchema>
