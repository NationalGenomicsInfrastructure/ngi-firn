import type { BaseDocument } from '../server/database/couchdb'
import type { FirnUser } from './auth'
import type { DocumentReferenceMap, TypedDocumentReference } from './references'
import type { RoomType, SciLifeLabBuilding } from '../schemas/inventory/rooms'

/*
 * Inventory Types - Table of Contents
 * **********************************
 *
 * CORE LOCATION MODEL:
 * InventoryLocationType - Allowed node types in the physical storage hierarchy
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
 */

/* Allowed hierarchy node types used by parent references and location paths. */
export type InventoryLocationType = 'room' | 'storageEquipment' | 'container'

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

/* Canonical action categories used for handling/audit workflows and embedded logs. */
export type InventoryStatusType
  = | 'available'
    | 'checked_out'
    | 'reserved'
    | 'expired'
    | 'disposed'
    | 'lost'
    | 'damaged'

/*
 * Compact audit log entry embedded directly in entity documents.
 * Each entry records one handling event (checkout, return, move, etc.).
 * Entries are append-only and immutable once written — they are the audit trail.
 * Planned tasks live as separate InventoryTask documents; when a task is
 * completed, a log entry is appended here and the task is marked done.
 */
export interface ActionLogEntry {
  actionType: InventoryActionType
  /* Who performed this action */
  firnUser: TypedDocumentReference<FirnUser>
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
  /* Stable URL slug */
  slug: string
  name: string
  label: string | null
  roomType: RoomType
  building: SciLifeLabBuilding
  floor: number
  roomNumber: number
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/* Physical equipment stored in a room; can contain containers/items and optional grid layout. */
export interface StorageEquipment extends BaseDocument {
  type: 'storageEquipment'
  schema: 1
  /* Typed reference to the parent room document. */
  parent: TypedDocumentReference<Room>
  /* Stable URL slug, not the CouchDB _id. */
  slug: string
  equipmentType: 'cabinet' | 'freezer' | 'fridge' | 'shelf' | 'nitrogenTank' | 'other'
  name: string
  label: string | null
  description: string | null
  rows: number | null
  columns: number | null
  levels: number | null
  temperatureCelsius: number | null
  /* Optional IDs for remote temperature sensor integration (SensorPush). */
  temperatureSensorId: string[] | null
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
  /* Typed reference to the parent document (storage equipment or another container). */
  parent: TypedDocumentReference<StorageEquipment | Container>
  /* Stable URL slug */
  slug: string
  containerType: 'rack' | 'box' | 'bag' | 'tray' | 'other'
  classification: 'sample' | 'control' | 'reagent' | 'equipment' | 'consumable' | 'other'
  name: string
  label: string | null
  description: string | null
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
  status: InventoryStatusType
  /* Embedded audit trail — append-only log of handling events. */
  actionLog: ActionLogEntry[]
  createdAt: string
  updatedAt: string
}

/* Trackable inventory entity with quantity/status and concrete placement in hierarchy. */
export interface InventoryItem extends BaseDocument {
  type: 'inventoryItem'
  schema: 1
  /* Typed reference to the parent document (room, equipment, or container). */
  parent: TypedDocumentReference<Room | StorageEquipment | Container>
  /* Stable URL slug (e.g. "itm-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
  /* Physical form factor of the item (what it IS). */
  category: 'eppendorf' | 'falcon' | 'cryovial' | 'vial' | 'bottle' | 'jar'
    | 'plate96' | 'plate384' | 'microscopySlide' | 'other'
  /* Purpose/domain classification (what it's FOR). */
  classification: 'sample' | 'reagent' | 'control' | 'library' | 'consumable' | 'equipment' | 'other'
  name: string
  label: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  /* Sample/reagent concentration. */
  concentration: number | null
  concentrationUnit: string | null
  position: GridPosition | null
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
  status: InventoryStatusType
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
  slug: string
  actionType: InventoryActionType
  status: InventoryTaskStatus
  /* Target entity this task applies to. */
  target: TypedDocumentReference<StorageEquipment | Container | InventoryItem>
  /* Who created this task. */
  createdBy: TypedDocumentReference<FirnUser>
  /* Who should perform it (null = unassigned). */
  assignedTo: TypedDocumentReference<FirnUser> | null
  /* Who actually completed/skipped/cancelled it. */
  completedBy: TypedDocumentReference<FirnUser> | null
  /* When the task was created. */
  plannedAt: string
  /* When the task is due (null = no deadline). */
  dueAt: string | null
  /* When it was completed/skipped/cancelled. */
  completedAt: string | null
  /* Location context for move/checkout/return tasks. */
  fromParent: TypedDocumentReference<Room | StorageEquipment | Container | InventoryItem> | null
  toParent: TypedDocumentReference<Room | StorageEquipment | Container | InventoryItem> | null
  fromPosition: GridPosition | null
  toPosition: GridPosition | null
  /* Links paired tasks, e.g. checkout → auto-created return task. */
  linkedTask: TypedDocumentReference<InventoryTask> | null
  description: string | null
  notes: string | null
}
