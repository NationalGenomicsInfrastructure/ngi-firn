import { z } from 'zod'

// Shared inventory schemas used across multiple domain-specific schema files.

// Document ID + revision pair required for updates and deletes
export const idRevSchema = z.object({
  id: z.string().min(1, { message: 'Document ID is required' }),
  rev: z.string().min(1, { message: 'Document revision is required' })
})

// Grid position within a structured storage layout
export const gridPositionSchema = z.object({
  row: z.number().int().min(0),
  column: z.number().int().min(0),
  level: z.number().int().min(0).optional(),
  label: z.string().optional()
})

// Hierarchy node types
export const inventoryLocationTypeSchema = z.enum([
  'room',
  'storageEquipment',
  'container'
])

// Room type classifications
export const roomTypeSchema = z.enum([
  'basement',
  'laboratory',
  'office',
  'storage',
  'other'
])

// Allowed building identifiers for room registration
export const roomBuildingSchema = z.enum([
  'alfa',
  'beta',
  'gamma',
  'delta'
])

// Storage equipment types
export const equipmentTypeSchema = z.enum([
  'cabinet',
  'freezer',
  'fridge',
  'shelf',
  'nitrogenTank',
  'other'
])

// Container type classifications
export const containerTypeSchema = z.enum([
  'rack',
  'box',
  'bag',
  'tray',
  'other'
])

// Container content classification
export const containerClassificationSchema = z.enum([
  'sample',
  'reagent',
  'equipment',
  'consumable',
  'other'
])

// Item physical form factor (what it IS)
export const inventoryItemCategorySchema = z.enum([
  'eppendorf',
  'falcon',
  'cryovial',
  'vial',
  'bottle',
  'jar',
  'plate96',
  'plate384',
  'microscopySlide',
  'other'
])

// Item domain purpose (what it's FOR)
export const inventoryItemClassificationSchema = z.enum([
  'sample',
  'reagent',
  'library',
  'consumable',
  'equipment',
  'other'
])

// Item lifecycle status
export const inventoryItemStatusSchema = z.enum([
  'available',
  'checked_out',
  'reserved',
  'expired',
  'disposed',
  'lost',
  'damaged'
])

// Action type categories (shared by ActionLogEntry and InventoryTask)
export const inventoryActionTypeSchema = z.enum([
  'checkout',
  'return',
  'move',
  'dispose',
  'reserve',
  'unreserve',
  'register',
  'modify',
  'flag',
  'note',
  'discard_expired'
])

// Task lifecycle status
export const inventoryTaskStatusSchema = z.enum([
  'planned',
  'completed',
  'skipped',
  'cancelled'
])

// Task target type (which entity types a task can reference)
export const inventoryTaskTargetTypeSchema = z.enum([
  'room',
  'storageEquipment',
  'container',
  'inventoryItem'
])

// Template applicability
export const templateForSchema = z.enum([
  'storageEquipment',
  'container',
  'inventoryItem'
])

// Cross-database document reference (matches DocumentReference from types/references.d.ts)
export const documentReferenceSchema = z.object({
  db: z.string().min(1),
  id: z.string().min(1),
  rev: z.string().optional(),
  type: z.string().optional()
})

// Map of named references (matches DocumentReferenceMap from types/references.d.ts)
export const documentReferenceMapSchema = z.record(
  z.string(),
  z.union([documentReferenceSchema, z.array(documentReferenceSchema)])
)
