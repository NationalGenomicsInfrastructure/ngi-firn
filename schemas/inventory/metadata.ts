import { z } from 'zod'

/* Canonical action categories used for handling/audit workflows and embedded logs. */
export const inventoryActionSchema = z.enum([
  'checkout', // Remove from storage for temporary use
  'return', // Put back in storage
  'move', // Relocate to a different parent/position
  'mark_expired', // Mark as expired (e.g. reagent shelf life)
  'dispose', // Discard permanently
  'post_missing', // Mark as missing (lost, misplaced etc.)
  'reserve', // Reserve for future use
  'unreserve', // Release reservation
  'register', // Initial registration in inventory
  'modify', // Properties changed (label, description, etc.)
  'flag', // Flag for attention (low quantity, issue)
  'unflag', // Remove a flag category
  'note' // Observation/comment (informational only)
])

/* Canonical action categories used for handling/audit workflows and embedded logs. */
export const inventoryFlagSchema = z.enum([
  'success',
  'warning',
  'error',
  'info'
])

/* Canonical action categories used for handling/audit workflows and embedded logs. */
export const inventoryStatusSchema = z.enum([
  'available',
  'in_use',
  'reserved',
  'expired',
  'disposed',
  'lost'
])

/* Canonical classification categories used for inventory items. */
export const inventoryClassificationSchema = z.enum([
  'Sample',
  'Reagent',
  'Control',
  'Library',
  'Consumable',
  'Equipment',
  'Other'
])

export type InventoryActionType = z.infer<typeof inventoryActionSchema>
export type InventoryClassificationType = z.infer<typeof inventoryClassificationSchema>
export type InventoryFlagType = z.infer<typeof inventoryFlagSchema>
export type InventoryStatusType = z.infer<typeof inventoryStatusSchema>
