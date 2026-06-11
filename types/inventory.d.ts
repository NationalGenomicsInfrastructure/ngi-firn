import type { BaseDocument } from '../server/database/couchdb'
import type { DocumentReferenceMap, TypedDocumentReference } from './references'

/*
 * Inventory Types - Table of Contents
 * **********************************
 *
 * CORE LOCATION MODEL:
 * InventoryLocationType - Allowed node types in the physical storage hierarchy
 * LocationAncestor - Materialized ancestry entry used in `locationPath` (id + type only)
 * GridPosition - Optional slot position within grid-like containers (with optional label)
 *
 * EMBEDDED AUDIT LOG:
 * ActionLogEntry - Compact log entry embedded in entity documents (immutable after creation)
 *
 * DOCUMENT TYPES (persisted in CouchDB):
 * Room - Top-level physical room/building location
 * StorageEquipment - Freezers/fridges/shelves/cabinets within a room (+ hardware details)
 * Container - Nested storage units with acceptance constraints and capacity
 * InventoryItem - Trackable sample/reagent/library with lab-specific fields and lifecycle
 * InventoryTask - Planned task document (checkout-return reminders, expiry disposal, etc.)
 * InventoryTemplate - Reusable defaults for containers, equipment, and items
 *
 * QUERY RESULT TYPES:
 * SuggestedLocation - Result from the free-capacity suggestion query
 *
 * SERVICE INPUT TYPES (CRUD contracts):
 * Create/Update interfaces - Input contracts for server/crud services.
 * These are intentionally separate from persisted document interfaces to
 * keep validation and mutation APIs explicit and stable over time.
 * locationPath is never in create/update inputs — it is computed server-side.
 */

/* Allowed hierarchy node types used by parent references and location paths. */
export type InventoryLocationType = 'room' | 'storageEquipment' | 'container'
export type RoomBuilding = 'alfa' | 'beta' | 'gamma' | 'delta'

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

/* Canonical action categories used for handling/audit workflows and embedded logs. */
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

/*
 * Compact audit log entry embedded directly in entity documents.
 * Each entry records one handling event (checkout, return, move, etc.).
 * Entries are append-only and immutable once written — they are the audit trail.
 * Planned tasks live as separate InventoryTask documents; when a task is
 * completed, a log entry is appended here and the task is marked done.
 */
export interface ActionLogEntry {
  actionType: InventoryActionType
  /* Who performed this action (user email). */
  userId: string
  /* ISO 8601 timestamp of when the action occurred. */
  timestamp: string
  /* Optional notes or reason for the action. */
  notes?: string
  /* For move/checkout/return: source parent entity ID. */
  fromParentId?: string
  /* For move/checkout/return: destination parent entity ID. */
  toParentId?: string
  /* Reference to the InventoryTask document that triggered this log entry, if any. */
  linkedTaskId?: string
}

/* Top-level physical location. Rooms are hierarchy roots for storage equipment. */
export interface Room extends BaseDocument {
  type: 'room'
  schema: 1
  /* Stable URL slug (e.g. "alfa-1-123"), not the CouchDB _id. */
  slug: string
  name: string
  label: string | null
  roomNumber: string | null
  roomType: 'basement' | 'laboratory' | 'office' | 'storage' | 'other'
  building: RoomBuilding
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
  /* Stable URL slug (e.g. "eqp-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
  equipmentType: 'cabinet' | 'freezer' | 'fridge' | 'shelf' | 'nitrogenTank' | 'other'
  name: string
  label: string | null
  description: string | null
  /* Typed reference to the parent room document. */
  parent: TypedDocumentReference<Room>
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
  /* Embedded audit trail — append-only log of handling events. */
  actionLog: ActionLogEntry[]
  createdAt: string
  updatedAt: string
}

/* Nested storage unit with constraints/capacity; can live in equipment or another container. */
export interface Container extends BaseDocument {
  type: 'container'
  schema: 1
  /* Stable URL slug (e.g. "cnt-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
  containerType: 'rack' | 'box' | 'bag' | 'tray' | 'other'
  classification: 'sample' | 'reagent' | 'equipment' | 'consumable' | 'other'
  name: string
  label: string | null
  description: string | null
  /* Typed reference to the parent document (storage equipment or another container). */
  parent: TypedDocumentReference<StorageEquipment | Container>
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
  /* Optional cross-database references to projects (read-only projects DB). */
  projectRefs: DocumentReferenceMap | null
  isActive: boolean
  /* Embedded audit trail — append-only log of handling events. */
  actionLog: ActionLogEntry[]
  createdAt: string
  updatedAt: string
}

/* Trackable inventory entity with quantity/status and concrete placement in hierarchy. */
export interface InventoryItem extends BaseDocument {
  type: 'inventoryItem'
  schema: 1
  /* Stable URL slug (e.g. "itm-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
  /* Physical form factor of the item (what it IS). */
  category: 'eppendorf' | 'falcon' | 'cryovial' | 'vial' | 'bottle' | 'jar'
    | 'plate96' | 'plate384' | 'microscopySlide' | 'other'
  /* Purpose/domain classification (what it's FOR). */
  classification: 'sample' | 'reagent' | 'library' | 'consumable' | 'equipment' | 'other'
  name: string
  label: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  /* Sample/reagent concentration. */
  concentration: number | null
  concentrationUnit: string | null
  /* Typed reference to the parent document (room, equipment, or container). */
  parent: TypedDocumentReference<Room | StorageEquipment | Container>
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
  /* Optional cross-database references to projects (read-only projects DB). */
  projectRefs: DocumentReferenceMap | null
  createdBy: string
  /* Embedded audit trail — append-only log of handling events. */
  actionLog: ActionLogEntry[]
  createdAt: string
  updatedAt: string
}

export type InventoryTaskStatus = 'planned' | 'completed' | 'skipped' | 'cancelled'

/*
 * Planned task document for scheduled lab operations (e.g. return reminders, expiry disposal).
 * Tasks are mutable while planned and can be assigned, rescheduled, or cancelled.
 * When a task is completed, an ActionLogEntry is appended to the target entity's
 * embedded actionLog and the task status is set to 'completed'.
 * Unlike ActionLogEntry (which is embedded), InventoryTask is its own CouchDB document
 * to support independent queries: overdue tasks, tasks by assignee, pending disposals.
 */
export interface InventoryTask extends BaseDocument {
  type: 'inventoryTask'
  schema: 1
  /* Stable URL slug (e.g. "inventory-task-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
  actionType: InventoryActionType
  status: InventoryTaskStatus
  /* Target entity this task applies to. */
  targetId: string
  targetType: 'room' | 'storageEquipment' | 'container' | 'inventoryItem'
  /* Who created this task. */
  createdBy: string
  /* Who should perform it (null = unassigned). */
  assignedTo: string | null
  /* Who actually completed/skipped/cancelled it. */
  completedBy: string | null
  /* When the task was created. */
  plannedAt: string
  /* When the task is due (null = no deadline). */
  dueAt: string | null
  /* When it was completed/skipped/cancelled. */
  completedAt: string | null
  /* Location context for move/checkout/return tasks. */
  fromParentId: string | null
  fromParentType: InventoryLocationType | null
  toParentId: string | null
  toParentType: InventoryLocationType | null
  fromPosition: GridPosition | null
  toPosition: GridPosition | null
  /* Links paired tasks, e.g. checkout → auto-created return task. */
  linkedTaskId: string | null
  description: string | null
  notes: string | null
}

/* Reusable defaults for recurring container/equipment/item setup patterns. */
export interface InventoryTemplate extends BaseDocument {
  type: 'inventoryTemplate'
  schema: 1
  /* Stable URL slug (e.g. "template-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
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
  name: string
  label?: string | null
  roomNumber: string
  roomType: Room['roomType']
  building: RoomBuilding
  floor: number
  description?: string | null
  isActive?: boolean
}

/* Update payload for room edits (partial patch + id/rev). */
export interface UpdateRoomInput {
  id: string
  rev: string
  name?: string
  label?: string | null
  roomNumber?: string
  roomType?: Room['roomType']
  building?: RoomBuilding
  floor?: number
  description?: string | null
  isActive?: boolean
}

/* Create payload for storage equipment in a room. */
export interface CreateStorageEquipmentInput {
  equipmentType: StorageEquipment['equipmentType']
  name: string
  label?: string | null
  description?: string | null
  parentId: string
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
  equipmentType?: StorageEquipment['equipmentType']
  name?: string
  label?: string | null
  description?: string | null
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
  containerType: Container['containerType']
  classification: Container['classification']
  name: string
  label?: string | null
  description?: string | null
  parentId: string
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  capacity?: number | null
  acceptedItemCategories?: string[] | null
  acceptedContainerCategories?: string[] | null
  templateId?: string | null
  color?: string | null
  projectRefs?: DocumentReferenceMap | null
  isActive?: boolean
}

/* Update payload for containers. */
export interface UpdateContainerInput {
  id: string
  rev: string
  containerType?: Container['containerType']
  classification?: Container['classification']
  name?: string
  label?: string | null
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
  projectRefs?: DocumentReferenceMap | null
  isActive?: boolean
  /* Moving uses a dedicated moveContainer() method, not update. */
}

/* Create payload for trackable inventory items. */
export interface CreateInventoryItemInput {
  category: InventoryItem['category']
  classification: InventoryItem['classification']
  name: string
  label?: string | null
  description?: string | null
  quantity?: number | null
  unit?: string | null
  concentration?: number | null
  concentrationUnit?: string | null
  parentId: string
  position?: GridPosition | null
  status?: InventoryItem['status']
  expiryDate?: string | null
  lotNumber?: string | null
  barcode?: string | null
  templateId?: string | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  projectRefs?: DocumentReferenceMap | null
}

/* Update payload for inventory items. Moving uses a dedicated moveItem() method. */
export interface UpdateInventoryItemInput {
  id: string
  rev: string
  category?: InventoryItem['category']
  classification?: InventoryItem['classification']
  name?: string
  label?: string | null
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
  projectRefs?: DocumentReferenceMap | null
}

/* Result of the free-capacity suggestion query — one candidate container with availability info. */
export interface SuggestedLocation {
  slug: string
  containerName: string
  containerType: Container['containerType']
  capacity: number
  occupied: number
  available: number
  locationPath: LocationAncestor[]
  temperatureCelsius: number | null
  classification: string | null
}

/* Create payload for a planned inventory task. */
export interface CreateInventoryTaskInput {
  actionType: InventoryActionType
  status?: InventoryTaskStatus
  targetId: string
  targetType: InventoryTask['targetType']
  assignedTo?: string | null
  dueAt?: string | null
  fromParentId?: string | null
  fromParentType?: InventoryLocationType | null
  toParentId?: string | null
  toParentType?: InventoryLocationType | null
  fromPosition?: GridPosition | null
  toPosition?: GridPosition | null
  linkedTaskId?: string | null
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
