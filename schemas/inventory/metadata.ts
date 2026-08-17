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
  'locate', // Re-place a lost item into a parent (lost -> available)
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

/*
 * Actions that vacate a container's physical slot: they free the source parent's
 * capacity/occupancy and unplace the container (parent -> null). Used by alterContainer.
 */
export const VACATING_ACTIONS: readonly InventoryActionType[] = ['dispose', 'post_missing']

/*
 * Actions with a dedicated workflow that must NOT be routed through alterContainer:
 *   - register / modify: their own create/update endpoints.
 *   - move: the dedicated move endpoint (parent capacity reservation).
 *   - locate: the dedicated locate endpoint (re-place a lost item; needs a destination).
 */
const DEDICATED_ACTIONS: readonly InventoryActionType[] = ['register', 'modify', 'move', 'locate']

/*
 * Status-driven action state machine — the single source of truth for which actions may be
 * applied to a container given its current status. Shared by the server (authoritative
 * validation in alterContainer/locateContainer) and the client (UI gating in the dialogs).
 *
 * `locate` is included for `lost` (its own dialog handles the re-placement); `dispose`
 * transitions to the terminal `disposed` status, which only permits `note`.
 */
export const STATUS_ACTION_MATRIX: Record<InventoryStatusType, readonly InventoryActionType[]> = {
  available: ['checkout', 'reserve', 'dispose', 'post_missing', 'mark_expired', 'flag', 'unflag', 'note'],
  in_use: ['return', 'dispose', 'post_missing', 'mark_expired', 'flag', 'unflag', 'note'],
  reserved: ['unreserve', 'dispose', 'post_missing', 'flag', 'unflag', 'note'],
  expired: ['dispose', 'post_missing', 'flag', 'unflag', 'note'],
  lost: ['locate', 'flag', 'unflag', 'note'],
  disposed: ['note']
}

/* Actions permitted for a container in the given status. */
export function allowedActionsForStatus(status: InventoryStatusType): readonly InventoryActionType[] {
  return STATUS_ACTION_MATRIX[status] ?? []
}

/* Whether an action is a lifecycle action handled by alterContainer (not a dedicated workflow). */
export function isAlterAction(action: InventoryActionType): boolean {
  return !DEDICATED_ACTIONS.includes(action)
}

/* Whether an action vacates the container's physical slot (frees the parent, unplaces it). */
export function isVacatingAction(action: InventoryActionType): boolean {
  return VACATING_ACTIONS.includes(action)
}
