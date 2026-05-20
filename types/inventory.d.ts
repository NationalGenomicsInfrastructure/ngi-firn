import type { BaseDocument } from '../server/database/couchdb'

/*
 * Inventory Types - Table of Contents
 * **********************************
 *
 * CORE LOCATION MODEL:
 * InventoryLocationType - Allowed node types in the physical storage hierarchy
 * LocationAncestor - Materialized ancestry entry used in `locationPath`
 * GridPosition - Optional slot position within grid-like containers
 *
 * DOCUMENT TYPES (persisted in CouchDB):
 * Room - Top-level physical room/building location
 * StorageEquipment - Freezers/fridges/shelves/cabinets within a room
 * Container - Nested storage units (rack/box/bag/etc.) inside equipment/containers
 * InventoryItem - Trackable sample/reagent/equipment unit stored in hierarchy
 * InventoryAction - Auditable handling event (planned or completed)
 * InventoryTemplate - Reusable default configuration for storage entities
 *
 * SERVICE INPUT TYPES (CRUD contracts):
 * Create/Update interfaces - Input contracts for server/crud services.
 * These are intentionally separate from persisted document interfaces to
 * keep validation and mutation APIs explicit and stable over time.
 */

/* Allowed hierarchy node types used by parent references and location paths. */
export type InventoryLocationType = 'room' | 'storageEquipment' | 'container'

/* One ancestry segment in a materialized location path (denormalized for fast reads). */
export interface LocationAncestor {
  id: string
  type: InventoryLocationType
  name: string
  label: string
}

/* Position inside grid-based storage layouts (e.g. box slots, rack coordinates). */
export interface GridPosition {
  row: number
  column: number
  level?: number
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
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/* Trackable inventory entity with quantity/status and concrete placement in hierarchy. */
export interface InventoryItem extends BaseDocument {
  type: 'inventoryItem'
  schema: 1
  itemId: string
  itemType: 'sample' | 'reagent' | 'equipment' | 'consumable' | 'other'
  name: string
  label: string
  description: string | null
  quantity: number | null
  unit: string | null
  parentId: string
  parentType: InventoryLocationType
  locationPath: LocationAncestor[]
  position: GridPosition | null
  status: 'available' | 'inUse' | 'reserved' | 'depleted' | 'lost' | 'damaged' | 'archived'
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/* Canonical action categories used for handling/audit workflows. */
export type InventoryActionType
  = | 'create'
    | 'update'
    | 'move'
    | 'consume'
    | 'split'
    | 'archive'
    | 'restore'
    | 'delete'

export type InventoryActionStatus = 'pending' | 'completed' | 'cancelled' | 'failed'

/* Immutable handling/audit record for movement, state transitions, and planning. */
export interface InventoryAction extends BaseDocument {
  type: 'inventoryAction'
  schema: 1
  actionId: string
  actionType: InventoryActionType
  status: InventoryActionStatus
  targetId: string
  targetType: 'room' | 'storageEquipment' | 'container' | 'inventoryItem'
  fromParentId: string | null
  fromParentType: InventoryLocationType | null
  toParentId: string | null
  toParentType: InventoryLocationType | null
  fromPosition: GridPosition | null
  toPosition: GridPosition | null
  performedBy: string
  performedAt: string
  comment: string | null
  details: Record<string, unknown> | null
}

/* Reusable defaults for recurring container/equipment setup patterns. */
export interface InventoryTemplate extends BaseDocument {
  type: 'inventoryTemplate'
  schema: 1
  templateId: string
  name: string
  description: string | null
  appliesTo: 'storageEquipment' | 'container'
  containerType: Container['containerType'] | null
  rows: number
  columns: number
  levels: number
  reservedPositions: GridPosition[]
  metadata: Record<string, unknown> | null
  isActive: boolean
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
  locationPath: LocationAncestor[]
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  temperatureCelsius?: number | null
  capacity?: number | null
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
  locationPath?: LocationAncestor[]
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  temperatureCelsius?: number | null
  capacity?: number | null
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
  locationPath: LocationAncestor[]
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  capacity?: number | null
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
  parentId?: string
  parentType?: Container['parentType']
  locationPath?: LocationAncestor[]
  position?: GridPosition | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  capacity?: number | null
  isActive?: boolean
}

/* Create payload for trackable inventory items. */
export interface CreateInventoryItemInput {
  itemId: string
  itemType: InventoryItem['itemType']
  name: string
  label: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  parentId: string
  parentType: InventoryItem['parentType']
  locationPath: LocationAncestor[]
  position?: GridPosition | null
  status?: InventoryItem['status']
  metadata?: Record<string, unknown> | null
}

/* Update payload for inventory items. */
export interface UpdateInventoryItemInput {
  id: string
  rev: string
  itemId?: string
  itemType?: InventoryItem['itemType']
  name?: string
  label?: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  parentId?: string
  parentType?: InventoryItem['parentType']
  locationPath?: LocationAncestor[]
  position?: GridPosition | null
  status?: InventoryItem['status']
  metadata?: Record<string, unknown> | null
}

/* Create payload for inventory action/log/task entries. */
export interface CreateInventoryActionInput {
  actionId: string
  actionType: InventoryActionType
  status?: InventoryActionStatus
  targetId: string
  targetType: InventoryAction['targetType']
  fromParentId?: string | null
  fromParentType?: InventoryLocationType | null
  toParentId?: string | null
  toParentType?: InventoryLocationType | null
  fromPosition?: GridPosition | null
  toPosition?: GridPosition | null
  performedBy: string
  performedAt?: string
  comment?: string | null
  details?: Record<string, unknown> | null
}

/* Create payload for reusable inventory templates. */
export interface CreateInventoryTemplateInput {
  templateId: string
  name: string
  description?: string | null
  appliesTo: InventoryTemplate['appliesTo']
  containerType?: InventoryTemplate['containerType']
  rows: number
  columns: number
  levels?: number
  reservedPositions?: GridPosition[]
  metadata?: Record<string, unknown> | null
  isActive?: boolean
}

/* Update payload for inventory templates. */
export interface UpdateInventoryTemplateInput {
  id: string
  rev: string
  templateId?: string
  name?: string
  description?: string | null
  appliesTo?: InventoryTemplate['appliesTo']
  containerType?: InventoryTemplate['containerType']
  rows?: number
  columns?: number
  levels?: number
  reservedPositions?: GridPosition[]
  metadata?: Record<string, unknown> | null
  isActive?: boolean
}
