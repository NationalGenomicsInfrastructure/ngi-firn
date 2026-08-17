import type { BaseDocument } from '../server/database/couchdb'
import type { FirnUser } from './auth'
import type { DocumentReferenceMap, TypedDocumentReference } from './references'
import type { ContainerCapacityEntry, ContainerChildKindType, ContainerType } from '../schemas/inventory/container'
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
 * GridDimensions - rows / columns / levels dimensions for a grid container
 * GridPosition - Optional slot position within grid-layout containers (with optional label)
 *
 * AUDIT LOG TYPES:
 * InventoryActionChangeRecord - Structured per-field diff record for audit log entries
 * InventoryActionLogEntry - Compact audit log entry embedded in entity documents (immutable after creation)
 * InventoryTrackedField - Field-level before/after snapshot for computing change records
 *
 * DOCUMENT TYPES (persisted in CouchDB):
 * Room - Top-level physical room/building location
 * StorageEquipment - Freezers/fridges/shelves/cabinets within a room (+ hardware details)
 * Container - Nested storage units with acceptance constraints and capacity
 * InventoryItem - Trackable sample/reagent/library with lab-specific fields and lifecycle
 * InventoryTask - Planned task document (checkout-return reminders, expiry disposal, etc.)
 *
 * CLIENT-SAFE PROJECTIONS:
 * DisplayRoom - Strips CouchDB-internal fields from a Room before sending to the client
 * DisplayStorageEquipment - Strips CouchDB-internal fields from StorageEquipment; replaces parent ref with human-readable room stub
 * DisplayContainer - Strips CouchDB-internal fields from a Container; replaces parent ref with human-readable stub
 *
 * UTILITY TYPES:
 * InventoryTaskStatus - Allowed task lifecycle states ('planned' | 'completed' | 'skipped' | 'cancelled')
 */

/* Allowed hierarchy node types used by parent references and location paths. */
export type LocationEntity = Room | StorageEquipment | Container

/* Defines a capacity with grid-based layouts */
export interface GridDimensions {
  rows: number
  columns: number
  levels: number
}

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
  /** Value before the change. Typed as `unknown` but must be JSON-serializable (never `undefined`). */
  before: NonNullable<unknown> | null
  /** Value after the change. Typed as `unknown` but must be JSON-serializable (never `undefined`). */
  after: NonNullable<unknown> | null
}

/*
 * Compact audit log entry embedded directly in entity documents.
 * Each entry records one handling event (checkout, return, move, etc.).
 * Entries are append-only and immutable once written — they are the audit trail.
 * Planned tasks live as separate InventoryTask documents; when a task is
 * completed, a log entry is appended here and the task is marked done.
 */
/*
 * A single active flag on an inventory entity (container, and later items).
 * `kind` is one of the four flag categories; `comment` is the optional reason supplied when the
 * flag was raised (mirrored into the action log). Entries are keyed by `kind` — a container holds
 * at most one flag per category, and re-flagging the same category overwrites its comment.
 */
export interface InventoryActiveFlag {
  kind: InventoryFlagType
  comment: string | null
}

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
 * Client-safe user stub for audit log entries. Replaces the stored
 * TypedDocumentReference<FirnUser> (which holds a CouchDB _id) with an enriched,
 * display-only projection — resolved server-side, analogous to SerializedEntityRef.
 * Never exposes the CouchDB _id to the client.
 */
export interface SerializedUserRef {
  /* Stable public user identifier (never the CouchDB _id). */
  firnId: string
  /* Display name (Google name, or given + family name). */
  name: string
  /* Avatar image URL, or null when unavailable (client falls back to initials). */
  avatar: string | null
}

/*
 * Client-safe projection of InventoryActionLogEntry. Identical to the stored entry
 * except firnUser is enriched into a SerializedUserRef instead of a raw document reference.
 */
export interface DisplayInventoryActionLogEntry {
  actionType: InventoryActionType
  /* Who performed this action (enriched, no CouchDB _id). */
  firnUser: SerializedUserRef
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
  before: NonNullable<unknown> | null
  after: NonNullable<unknown> | null
}

/*
 *  Human-readable parent reference — replaces the TypedDocumentReference that held a CouchDB _id.
 */
export type SerializedEntityRef = { slug: string, name: string, kind: 'container' | 'equipment' | 'item' | 'project' | 'room' | 'task' | 'template' }

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
  parentRoom: SerializedEntityRef
  createdAt: string
  updatedAt: string
}

/* Nested storage unit with constraints/capacity; can live in equipment or another container. */
export interface Container extends BaseDocument {
  type: 'container'
  schema: 2
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
  activeFlags: InventoryActiveFlag[] | null
  status: InventoryStatusType
}

/*
 * Compact, client-safe projection of a project referenced by an inventory document (Container, Item, …).
 * Resolved server-side from the read-only projects DB; replaces the raw DocumentReferenceMap
 * (which only carried CouchDB _ids) with fields the UI can display directly.
 * Modelled after FirnProjectBookmark but omits the user-specific note field and the
 * internal projectDocId reference since inventory documents only need the human-readable context.
 */
export interface InventoryProjectRef {
  /* LIMS / StatusDB project identifier (e.g. "A.Doe_23_01"). */
  projectId: string
  projectName: string
  /* NGI sequencing application (e.g. "Chromatin", "RNA-seq"). */
  application: string | null
  affiliation: string | null
  /* Current project lifecycle status (e.g. "Ongoing", "Closed"). */
  status: string | null
}

/*
 * Client-safe projection of a Container document.
 * Strips CouchDB-internal fields (_id, _rev, document type discriminator, schema version).
 * Replaces `parent: TypedDocumentReference<StorageEquipment | Container>` with a human-readable
 * `parentRef` stub that exposes only the parent's public slug, name, and hierarchy kind.
 * Replaces `projectRefs: DocumentReferenceMap` with SerializedEntityRef stubs extracted from the
 * stored slug/name hints — no projects DB fetch required. Use getContainerProjectRefs() for the
 * full InventoryProjectRef detail (application, affiliation, status).
 * The actionLog is truncated to the N most recent entries; the full audit trail is available
 * via a dedicated tRPC procedure (getContainerActionLog).
 */
export interface DisplayContainer {
  slug: string
  barcode: string | null
  containerType: ContainerType
  classification: InventoryClassificationType
  name: string
  label: string | null
  description: string | null
  /* One entry per container or item type; `stored` is the server-owned occupancy counter. */
  capacity: ContainerCapacityEntry[] | null
  /* Position of this container within its parent container (null when parent is equipment). */
  positionParent: GridPosition | null
  templateId: string | null
  /*
   * Project associations as slug/name stubs, extracted from stored DocumentReferenceMap hints.
   * No projects DB fetch; use getContainerProjectRefs() for full detail.
   * null when the container has no project associations.
   */
  projectRefs: SerializedEntityRef[] | null
  activeFlags: InventoryActiveFlag[] | null
  status: InventoryStatusType
  /*
   * Human-readable parent reference — replaces the TypedDocumentReference that held a CouchDB _id.
   * null only for root-level containers that have no parent in the hierarchy.
   * `kind` tells the client whether to navigate to an equipment or container detail page.
   */
  parentRef: SerializedEntityRef | null
  /* The N most recent audit log entries (enriched). Use getContainerActionLog() to retrieve the full history. */
  recentActionLog: DisplayInventoryActionLogEntry[]
  createdAt: string
  updatedAt: string
}

/*
 * One accepted child category of a specific parent (equipment or container), with the
 * remaining free slot count. Projected directly from the parent document's authoritative
 * `capacity[]` array (each entry's server-owned `stored` counter) — no CouchDB view.
 * Equipment parents only accept containers, so their entries have childKind 'container'
 * and layout 'count'. Consumers (e.g. the add-container stepper) filter by childKind.
 */
export interface AcceptedChildCapacity {
  childKind: ContainerChildKindType
  type: ContainerType | ItemType
  layout: 'count' | 'grid'
  /* Total slot count (grid: rows*columns*levels; count: the declared capacity). */
  total: number
  /* Occupied slots. */
  stored: number
  /* Remaining slots, clamped to >= 0. */
  free: number
}

/*
 * A candidate destination for moving a container: a parent (equipment or container) that
 * accepts this container's type and still has at least one free slot. Sourced from the
 * `capacity_by_accepted_category` view; the container itself, its descendants, and its
 * current parent are excluded upstream. `free` is the remaining slot count for this type.
 */
export interface ContainerMoveTarget {
  slug: string
  name: string
  kind: 'container' | 'equipment'
  free: number
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
  projectRefs: SerializedEntityRef[] | null
  status: InventoryStatusType
  /* Embedded audit trail — append-only log of handling events. */
  actionLog: ActionLogEntry[]
  /* Active flags: Colored highlights that allow marking important states or issues. */
  activeFlags: InventoryActiveFlag[] | null
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
