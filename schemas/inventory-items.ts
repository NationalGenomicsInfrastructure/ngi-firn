import { z } from 'zod'
import {
  gridPositionSchema,
  idRevSchema,
  inventoryItemCategorySchema,
  inventoryItemClassificationSchema,
  inventoryItemStatusSchema,
  inventoryLocationTypeSchema
} from './inventory-common'

// Item CRUD schemas

export const createItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' }),
  category: inventoryItemCategorySchema,
  classification: inventoryItemClassificationSchema,
  name: z.string().min(1, { message: 'Item name is required' }),
  label: z.string().min(1, { message: 'Item label is required' }),
  description: z.string().nullish(),
  quantity: z.number().nullish(),
  unit: z.string().nullish(),
  concentration: z.number().nullish(),
  concentrationUnit: z.string().nullish(),
  parentId: z.string().min(1, { message: 'Parent ID is required' }),
  parentType: inventoryLocationTypeSchema,
  position: gridPositionSchema.nullish(),
  status: inventoryItemStatusSchema.optional(),
  expiryDate: z.string().nullish(),
  lotNumber: z.string().nullish(),
  barcode: z.string().nullish(),
  templateId: z.string().nullish(),
  notes: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish()
})

export const updateItemSchema = idRevSchema.extend({
  itemId: z.string().min(1).optional(),
  category: inventoryItemCategorySchema.optional(),
  classification: inventoryItemClassificationSchema.optional(),
  name: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullish(),
  quantity: z.number().nullish(),
  unit: z.string().nullish(),
  concentration: z.number().nullish(),
  concentrationUnit: z.string().nullish(),
  position: gridPositionSchema.nullish(),
  status: inventoryItemStatusSchema.optional(),
  expiryDate: z.string().nullish(),
  lotNumber: z.string().nullish(),
  barcode: z.string().nullish(),
  templateId: z.string().nullish(),
  notes: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish()
})

export const deleteItemSchema = idRevSchema

// Item operations schemas

export const moveItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' }),
  newParentId: z.string().min(1, { message: 'Target parent ID is required' }),
  newParentType: inventoryLocationTypeSchema,
  position: gridPositionSchema.nullish()
})

export const checkoutItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' })
})

export const returnItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' }),
  parentId: z.string().min(1, { message: 'Return location ID is required' }),
  parentType: inventoryLocationTypeSchema,
  position: gridPositionSchema.nullish()
})

export const reserveItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' }),
  description: z.string().optional()
})

export const unreserveItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' })
})

export const disposeItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' }),
  notes: z.string().optional(),
  confirm: z.literal(true, { message: 'Disposal must be explicitly confirmed' })
})

export const flagItemSchema = z.object({
  itemId: z.string().min(1, { message: 'Item ID is required' }),
  description: z.string().min(1, { message: 'Flag description is required' })
})

export const searchItemsSchema = z.object({
  query: z.string().min(1, { message: 'Search query is required' })
})

export const getItemsByStatusSchema = z.object({
  status: inventoryItemStatusSchema
})

export const getExpiringItemsSchema = z.object({
  beforeDate: z.string().min(1, { message: 'Expiry cutoff date is required' })
})

// Inferred types
export type CreateItemSchemaInput = z.infer<typeof createItemSchema>
export type UpdateItemSchemaInput = z.infer<typeof updateItemSchema>
export type MoveItemSchemaInput = z.infer<typeof moveItemSchema>
export type CheckoutItemSchemaInput = z.infer<typeof checkoutItemSchema>
export type ReturnItemSchemaInput = z.infer<typeof returnItemSchema>
export type ReserveItemSchemaInput = z.infer<typeof reserveItemSchema>
export type DisposeItemSchemaInput = z.infer<typeof disposeItemSchema>
export type FlagItemSchemaInput = z.infer<typeof flagItemSchema>
export type SearchItemsSchemaInput = z.infer<typeof searchItemsSchema>
