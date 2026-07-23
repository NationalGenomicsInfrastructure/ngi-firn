import type { BaseDocument } from '../server/database/couchdb'
import type { FirnUser } from './auth'
import type { DocumentReferenceMap, TypedDocumentReference } from './references'
import type { ContainerCapacityEntry, ContainerType } from '../schemas/inventory/container'
import type { EquipmentCapacityEntry, EquipmentType } from '../schemas/inventory/equipment'
import type { ItemType } from '../schemas/inventory/items'
import type { InventoryActionType, InventoryClassificationType, InventoryFlagType, InventoryStatusType } from '../schemas/inventory/metadata'
import type { RoomType, SciLifeLabBuilding } from '../schemas/inventory/rooms'

/*
 * Inventory Types - Table of Contents
 * **********************************
 *
 * CORE LOCATION MODEL:
 * LocationEntity - Allowed node types in the physical storage hierarchy
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

/* Allowed hierarchy node types used by parent references and location paths. */
export type LocationEntity = Room | StorageEquipment | Container

/* Position inside grid-based storage layouts (e.g. box slots, rack coordinates). */
export interface GridPosition {
  row: number
  column: number
  level?: number
  /*
   * Human-readable slot label, e.g. "A3", "Slot 7". When the client omits it, the
   * CRUD service derives it from row/column via deriveGridLabel() (lab convention:
   * row-letter + column-number). The grid dimensions themselves live on the parent's
   * capacity entry (a 'grid'-layout ContainerCapacityEntry), not on a standalone type.
   */
  label?: string
}

/* Structured per-field diff record for standardized audit logging. */
export interface InventoryActionChangeRecord {
  field: string
  before: unknown
  after: unknown
}

/*
 * Compact audit log entry embedded directly in entity documents.
 * Each entry records one handling event (checkout, return, move, etc.).
 * Entries are append-only and immutable once written — they are the audit trail.
 * Planned tasks live as separate InventoryTask documents; when a task is
 * completed, a log entry is appended here and the task is marked done.
 */
export interface InventoryActionLogEntry {
  actionType: InventoryActionType
  /* Who performed this action */
  firnUser: TypedDocumentReference<FirnUser>
  /* ISO 8601 timestamp of when the action occurred. */
  timestamp: string
  /* Optional notes or reason for the action. */
  notes?: string
  /* Optional flag for the log entry (e.g. 'warning', 'error', 'info'). */
  flag?: InventoryFlagType
  /* Structured change records (e.g. update before/after pairs), if applicable. */
  changes?: InventoryActionChangeRecord[]
  /* Reference to the InventoryTask document that triggered this log entry, if any. */
  linkedTaskId?: string
}

/*
 * Compact log structure for field value changes.
 */
export interface InventoryTrackedField {
  field: string
  before: unknown
  after: unknown
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

/*
 * Client-safe projection of a Room document.
 * Strips CouchDB-internal fields (_id, _rev, document type discriminator, schema version)
 * while preserving all business fields needed by the UI.
 * NOTE: `type` here refers to the CouchDB discriminator `'room'`, not `roomType`
 *       (the business-meaningful room category — that is intentionally preserved).
 */
export interface DisplayRoom {
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
  equipmentType: EquipmentType
  name: string
  label: string | null
  description: string | null
  /* One entry per container type; `stored` is the server-owned occupancy counter. */
  capacity: EquipmentCapacityEntry[] | null
  temperatureCelsius: number | null
  /* Optional IDs for remote temperature sensor integration (SensorPush). */
  temperatureSensorId: string[] | null
  /* Hardware identification for maintenance and tracking. */
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/*
 * Client-safe projection of a StorageEquipment document.
 * Strips CouchDB-internal fields (_id, _rev, document type discriminator, schema version).
 * Replaces `parent: TypedDocumentReference<Room>` (which embeds a CouchDB _id) with a
 * human-readable `parentRoom` object containing only the room's public slug and name.
 */
export interface DisplayStorageEquipment {
  slug: string
  equipmentType: EquipmentType
  name: string
  label: string | null
  description: string | null
  /* One entry per container type; `stored` is the server-owned occupancy counter. */
  capacity: EquipmentCapacityEntry[] | null
  temperatureCelsius: number | null
  /* Optional IDs for remote temperature sensor integration (SensorPush). */
  temperatureSensorId: string[] | null
  /* Hardware identification for maintenance and tracking. */
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  isActive: boolean
  /* Human-readable parent room reference — replaces the TypedDocumentReference that held a CouchDB _id. */
  parentRoom: { slug: string, name: string }
  createdAt: string
  updatedAt: string
}

/* Nested storage unit with constraints/capacity; can live in equipment or another container. */
export interface Container extends BaseDocument {
  type: 'container'
  schema: 1
  /* Typed reference to the parent document (storage equipment or another container). */
  parent: TypedDocumentReference<StorageEquipment | Container> | null
  /* Position of this container within its parent container (if applicable). */
  positionParent: GridPosition | null
  /* Stable URL slug */
  slug: string
  /* External barcode on physical item — integrates with barcode scanning infra. */
  barcode: string | null
  containerType: ContainerType
  classification: InventoryClassificationType
  name: string
  label: string | null
  description: string | null
  /* One entry per container or item type; `stored` is the server-owned occupancy counter. */
  capacity: ContainerCapacityEntry[] | null
  /* Generated from this container template (if applicable). */
  templateId: string | null
  /* Optional cross-database references to projects (read-only projects DB). */
  projectRefs: DocumentReferenceMap | null
  /* Embedded audit trail — append-only log of handling events. */
  createdAt: string
  updatedAt: string
  actionLog: InventoryActionLogEntry[]
  activeFlags: InventoryFlagType[] | null
  status: InventoryStatusType
}

/* Trackable inventory entity with quantity/status and concrete placement in hierarchy. */
export interface InventoryItem extends BaseDocument {
  type: 'inventoryItem'
  schema: 1
  /* Typed reference to the parent document (room, equipment, or container). */
  parent: TypedDocumentReference<Room | StorageEquipment | Container> | null
  /* Stable URL slug (e.g. "itm-m42x1c-abc123"), not the CouchDB _id. */
  slug: string
  /* Physical form factor of the item (what it IS). */
  category: ItemType
  /* Purpose/domain classification (what it's FOR). */
  classification: InventoryClassificationType
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
  /* Active flags: Colored highlights that allow marking important states or issues. */
  activeFlags: InventoryFlagType[] | null
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
  fromParent: TypedDocumentReference<LocationEntity> | null
  toParent: TypedDocumentReference<LocationEntity> | null
  fromPosition: GridPosition | null
  toPosition: GridPosition | null
  /* Links paired tasks, e.g. checkout → auto-created return task. */
  linkedTask: TypedDocumentReference<InventoryTask> | null
  description: string | null
  notes: string | null
}
