import type { BaseDocument } from '../server/database/couchdb'

/*
 * Inventory Types - Table of Contents
 * **********************************
 *
 * CORE LOCATION MODEL:
 * InventoryLocationType - Allowed node types in the physical storage hierarchy
 * LocationAncestor - Materialized ancestry entry used in `locationPath` (id + type only)
 * GridPosition - Optional slot position within grid-like containers (with optional label)
 *
 * DOCUMENT TYPES (persisted in CouchDB):
 * Room - Top-level physical room/building location
 * StorageEquipment - Freezers/fridges/shelves/cabinets within a room (+ hardware details)
 * Container - Nested storage units with acceptance constraints and capacity
 * InventoryItem - Trackable sample/reagent/library with lab-specific fields and lifecycle
 * InventoryAction - Auditable handling event AND plannable task (checkout/return/expiry/etc.)
 * InventoryTemplate - Reusable defaults for containers, equipment, and items
 *
 * SERVICE INPUT TYPES (CRUD contracts):
 * Create/Update interfaces - Input contracts for server/crud services.
 * These are intentionally separate from persisted document interfaces to
 * keep validation and mutation APIs explicit and stable over time.
 * locationPath is never in create/update inputs — it is computed server-side.
 */

/* Allowed hierarchy node types used by parent references and location paths. */
export type InventoryLocationType = 'room' | 'storageEquipment' | 'container'

/*
 * One ancestry segment in a materialized location path (denormalized for fast reads).
 * Only immutable identifiers are stored — not names — since names can change.
 * Use resolveLocationBreadcrumb() to batch-fetch display names on demand.
 */
export interface LocationAncestor {
  id: string
  type: InventoryLocationType
}

/* Position inside grid-based storage layouts (e.g. box slots, rack coordinates). */
export interface GridPosition {
  row: number
  column: number
  level?: number
  /* Human-readable slot label, e.g. "A3", "Slot 7". Derived from row/column if omitted. */
  label?: string
}

/* Top-level physical location. Rooms are hierarchy roots for storage equipment. */
export interface Room extends BaseDocument {
  type: 'room'
  schema: 1
  roomId: string
  name: string
  label: string
  roomNumber: string | null
  roomType: 'basement' | 'laboratory' | 'office' | 'storage' | 'other'
  building: string
  floor: number | null
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/* Physical equipment stored in a room; can contain containers/items and optional grid layout. */
export interface StorageEquipment extends BaseDocument {
  type: 'storageEquipment'
  schema: 1
  equipmentId: string
  equipmentType: 'cabinet' | 'freezer' | 'fridge' | 'shelf' | 'nitrogenTank' | 'other'
  name: string
  label: string
  description: string | null
  parentId: string
  parentType: 'room'
  locationPath: LocationAncestor[]
  position: GridPosition | null
  rows: number | null
  columns: number | null
  levels: number | null
  temperatureCelsius: number | null
  capacity: number | null
  /* Hardware identification for maintenance and tracking. */
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/* Nested storage unit with constraints/capacity; can live in equipment or another container. */
export interface Container extends BaseDocument {
  type: 'container'
  schema: 1
  containerId: string
  containerType: 'rack' | 'box' | 'bag' | 'bottle' | 'jar' | 'plate' | 'other'
  classification: 'sample' | 'reagent' | 'equipment' | 'consumable' | 'other'
  name: string
  label: string
  description: string | null
  parentId: string
  parentType: Exclude<InventoryLocationType, 'room'>
  locationPath: LocationAncestor[]
  position: GridPosition | null
  rows: number | null
  columns: number | null
  levels: number | null
  capacity: number | null
  /* Constraint: which item categories this container can hold (null = any). */
  acceptedItemCategories: string[] | null
  /* Constraint: which container categories can be nested inside (null = any). */
  acceptedContainerCategories: string[] | null
  /* Template this container was created from (informational, not live-linked). */
  templateId: string | null
  /* Physical color for visual identification in the lab. */
  color: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/* Trackable inventory entity with quantity/status and concrete placement in hierarchy. */
export interface InventoryItem extends BaseDocument {
  type: 'inventoryItem'
  schema: 1
  itemId: string
  /* Physical form factor of the item (what it IS). */
  category: 'eppendorf' | 'falcon' | 'cryovial' | 'vial' | 'bottle'
    | 'plate96' | 'plate384' | 'microscopySlide' | 'other'
  /* Purpose/domain classification (what it's FOR). */
  classification: 'sample' | 'reagent' | 'library' | 'consumable' | 'equipment' | 'other'
  name: string
  label: string
  description: string | null
  quantity: number | null
  unit: string | null
  /* Sample/reagent concentration. */
  concentration: number | null
  concentrationUnit: string | null
  parentId: string
  parentType: InventoryLocationType
  locationPath: LocationAncestor[]
  position: GridPosition | null
  status: 'available' | 'checked_out' | 'reserved' | 'expired' | 'disposed' | 'lost' | 'damaged'
  /* ISO 8601 date; drives the expiry-reminder workflow. */
  expiryDate: string | null
  lotNumber: string | null
  /* External barcode on physical item — integrates with barcode scanning infra. */
  barcode: string | null
  /* Template this item was created from (informational, not live-linked). */
  templateId: string | null
  notes: string | null
  /* Escape hatch for truly ad-hoc data not covered by typed fields. */
  metadata: Record<string, unknown> | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/* Canonical action categories used for handling/audit workflows. */
export type InventoryActionType
  = | 'checkout' // Remove from storage for temporary use
    | 'return' // Put back in storage
    | 'move' // Relocate to a different parent/position
    | 'dispose' // Discard permanently
    | 'reserve' // Reserve for future use
    | 'unreserve' // Release reservation
    | 'register' // Initial registration in inventory
    | 'modify' // Properties changed (label, description, etc.)
    | 'flag' // Flag for attention (low quantity, issue)
    | 'note' // Observation/comment (informational only)
    | 'discard_expired' // Dispose due to expiry (system-suggested)

export type InventoryActionStatus = 'planned' | 'completed' | 'skipped' | 'cancelled'

/*
 * Immutable handling/audit record for movement, state transitions, and planning.
 * Completed actions are frozen log entries; planned actions are mutable tasks.
 */
export interface InventoryAction extends BaseDocument {
  type: 'inventoryAction'
  schema: 1
  actionId: string
  actionType: InventoryActionType
  status: InventoryActionStatus
  /* Target entity this action applies to. */
  targetId: string
  targetType: 'room' | 'storageEquipment' | 'container' | 'inventoryItem'
  /* Snapshot of target name at action time — frozen for audit, not kept in sync. */
  targetName: string
  /* Who created/planned this action. */
  createdBy: string
  /* Who should perform it (for planned actions; null for log entries). */
  assignedTo: string | null
  /* Who actually completed/skipped/cancelled it. */
  completedBy: string | null
  /* When the action record was created. */
  plannedAt: string
  /* When the planned action is due (null for immediate log entries). */
  dueAt: string | null
  /* When it was completed/skipped/cancelled. */
  completedAt: string | null
  /* Location context for move/checkout/return actions. */
  fromParentId: string | null
  fromParentType: InventoryLocationType | null
  toParentId: string | null
  toParentType: InventoryLocationType | null
  fromPosition: GridPosition | null
  toPosition: GridPosition | null
  /* Links paired actions, e.g. checkout → auto-created return task. */
  linkedActionId: string | null
  description: string | null
  notes: string | null
}

/* Reusable defaults for recurring container/equipment/item setup patterns. */
export interface InventoryTemplate extends BaseDocument {
  type: 'inventoryTemplate'
  schema: 1
  templateId: string
  name: string
  description: string | null
  templateFor: 'storageEquipment' | 'container' | 'inventoryItem'
  /* Default category/classification applied at creation time. */
  defaultCategory: string | null
  defaultClassification: string | null
  /* Container/equipment-specific grid defaults (null for item templates). */
  rows: number | null
  columns: number | null
  levels: number | null
  capacity: number | null
  reservedPositions: GridPosition[]
  /* Container-specific acceptance constraints. */
  acceptedItemCategories: string[] | null
  acceptedContainerCategories: string[] | null
  defaultColor: string | null
  /* Item-specific defaults (null for container/equipment templates). */
  defaultUnit: string | null
  defaultConcentrationUnit: string | null
  metadata: Record<string, unknown> | null
  isActive: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

/* Create payload for room registration. */
export interface CreateRoomInput {
  roomId: string
  name: string
  label: string
  roomNumber?: string | null
  roomType: Room['roomType']
  building: string
  floor?: number | null
  description?: string | null
  isActive?: boolean
}

/* Update payload for room edits (partial patch + id/rev). */
export interface UpdateRoomInput {
  id: string
  rev: string
  roomId?: string
  name?: string
  label?: string
  roomNumber?: string | null
  roomType?: Room['roomType']
  building?: string
  floor?: number | null
  description?: string | null
  isActive?: boolean
}

/* Create payload for storage equipment in a room. */
export interface CreateStorageEquipmentInput {
  equipmentId: string
  equipmentType: StorageEquipment['equipmentType']
  name: string
  label: string
  description?: string | null
  parentId: string
  parentType: StorageEquipment['parentType']
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  temperatureCelsius?: number | null
  capacity?: number | null
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  isActive?: boolean
}

/* Update payload for storage equipment. */
export interface UpdateStorageEquipmentInput {
  id: string
  rev: string
  equipmentId?: string
  equipmentType?: StorageEquipment['equipmentType']
  name?: string
  label?: string
  description?: string | null
  parentId?: string
  parentType?: StorageEquipment['parentType']
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  temperatureCelsius?: number | null
  capacity?: number | null
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  isActive?: boolean
}

/* Create payload for containers in the hierarchy. */
export interface CreateContainerInput {
  containerId: string
  containerType: Container['containerType']
  classification: Container['classification']
  name: string
  label: string
  description?: string | null
  parentId: string
  parentType: Container['parentType']
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  capacity?: number | null
  acceptedItemCategories?: string[] | null
  acceptedContainerCategories?: string[] | null
  templateId?: string | null
  color?: string | null
  isActive?: boolean
}

/* Update payload for containers. */
export interface UpdateContainerInput {
  id: string
  rev: string
  containerId?: string
  containerType?: Container['containerType']
  classification?: Container['classification']
  name?: string
  label?: string
  description?: string | null
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  capacity?: number | null
  acceptedItemCategories?: string[] | null
  acceptedContainerCategories?: string[] | null
  templateId?: string | null
  color?: string | null
  isActive?: boolean
  /* Moving uses a dedicated moveContainer() method, not update. */
}

/* Create payload for trackable inventory items. */
export interface CreateInventoryItemInput {
  itemId: string
  category: InventoryItem['category']
  classification: InventoryItem['classification']
  name: string
  label: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  concentration?: number | null
  concentrationUnit?: string | null
  parentId: string
  parentType: InventoryItem['parentType']
  position?: GridPosition | null
  status?: InventoryItem['status']
  expiryDate?: string | null
  lotNumber?: string | null
  barcode?: string | null
  templateId?: string | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
}

/* Update payload for inventory items. Moving uses a dedicated moveItem() method. */
export interface UpdateInventoryItemInput {
  id: string
  rev: string
  itemId?: string
  category?: InventoryItem['category']
  classification?: InventoryItem['classification']
  name?: string
  label?: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  concentration?: number | null
  concentrationUnit?: string | null
  position?: GridPosition | null
  status?: InventoryItem['status']
  expiryDate?: string | null
  lotNumber?: string | null
  barcode?: string | null
  templateId?: string | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
}

/* Create payload for inventory action/log/task entries. */
export interface CreateInventoryActionInput {
  actionType: InventoryActionType
  status?: InventoryActionStatus
  targetId: string
  targetType: InventoryAction['targetType']
  assignedTo?: string | null
  dueAt?: string | null
  fromParentId?: string | null
  fromParentType?: InventoryLocationType | null
  toParentId?: string | null
  toParentType?: InventoryLocationType | null
  fromPosition?: GridPosition | null
  toPosition?: GridPosition | null
  linkedActionId?: string | null
  description?: string | null
  notes?: string | null
}

/* Create payload for reusable inventory templates. */
export interface CreateInventoryTemplateInput {
  name: string
  description?: string | null
  templateFor: InventoryTemplate['templateFor']
  defaultCategory?: string | null
  defaultClassification?: string | null
  capacity?: number | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  reservedPositions?: GridPosition[]
  acceptedItemCategories?: string[] | null
  acceptedContainerCategories?: string[] | null
  defaultColor?: string | null
  defaultUnit?: string | null
  defaultConcentrationUnit?: string | null
  metadata?: Record<string, unknown> | null
  isActive?: boolean
}

/* Update payload for inventory templates. */
export interface UpdateInventoryTemplateInput {
  id: string
  rev: string
  name?: string
  description?: string | null
  templateFor?: InventoryTemplate['templateFor']
  defaultCategory?: string | null
  defaultClassification?: string | null
  capacity?: number | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  reservedPositions?: GridPosition[]
  acceptedItemCategories?: string[] | null
  acceptedContainerCategories?: string[] | null
  defaultColor?: string | null
  defaultUnit?: string | null
  defaultConcentrationUnit?: string | null
  metadata?: Record<string, unknown> | null
  isActive?: boolean
}
