/*
 * Inventory Helpers - Table of Contents
 * ************************************
 *
 * TYPES AND DESIGN DOC HELPERS:
 * toLocationAncestor(entity) - Convert a location entity into ancestor shape
 * isLocationEntity(doc) - Type guard for room/equipment/container entities
 * loadDesignDoc(pathParts, fallbackId) - Load and validate view design-doc JSON
 * upsertDesignDoc(designDoc) - Insert/update a CouchDB design document
 *
 * GENERAL HELPERS:
 * generateInventoryId(prefix) - Generate stable prefixed IDs for inventory entities
 * buildLocationPath(parent) - Build child ancestry path from a parent entity
 * resolveLocationBreadcrumb(locationPath, parentId) - Batch-fetch ancestor names for display breadcrumb
 * cascadeLocationPathUpdate(entityId, entityType, newPath) - Propagate ancestry changes to descendants
 * validateContainerAcceptance(parent, childType, childCategory) - Enforce parent/child compatibility
 * validateCapacity(parentId, parentCapacity) - Check whether parent still has free capacity
 * validateGridPosition(parentId, position, gridRows, gridCols, excludeChildId?) - Validate unique in-bounds grid slot
 * ensureInventoryViews() - Ensure inventory design documents exist in CouchDB
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CloudantV1 } from '@ibm-cloud/cloudant'
import { couchDB } from '../database/couchdb'
import type {
  Container,
  GridPosition,
  InventoryItem,
  LocationAncestor,
  Room,
  StorageEquipment
} from '../../types/inventory'

type LocationEntity = Room | StorageEquipment | Container
type InventoryChildDocument = (StorageEquipment | Container | InventoryItem) & {
  _id: string
  _rev: string
  locationPath?: LocationAncestor[]
  parentId?: string
  updatedAt?: string
}

interface DesignDocDefinition extends CloudantV1.Document {
  _id: string
  _rev?: string
  language?: string
  views: Record<string, unknown>
}

const CASCADE_ENTITY_TYPES = ['storageEquipment', 'container', 'inventoryItem']

/* Convert a location entity into the ancestor format used by locationPath arrays. */
function toLocationAncestor(entity: LocationEntity): LocationAncestor {
  return {
    id: entity._id,
    type: entity.type
  }
}

/* Validate that a document has the minimum fields required for breadcrumb ancestry. */
function isLocationEntity(doc: unknown): doc is LocationEntity {
  if (!doc || typeof doc !== 'object') {
    return false
  }

  const maybeDoc = doc as Partial<LocationEntity>
  return (
    typeof maybeDoc._id === 'string'
    && (maybeDoc.type === 'room' || maybeDoc.type === 'storageEquipment' || maybeDoc.type === 'container')
    && typeof maybeDoc.name === 'string'
    && typeof maybeDoc.label === 'string'
  )
}

/* Load and validate a design-document JSON file from docs/couchdb-views. */
async function loadDesignDoc(pathParts: string[], fallbackId: string): Promise<DesignDocDefinition | null> {
  try {
    const filePath = join(process.cwd(), ...pathParts)
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DesignDocDefinition>

    if (!parsed || typeof parsed !== 'object' || !parsed.views || typeof parsed.views !== 'object') {
      throw new Error(`Invalid CouchDB view definition at ${filePath}`)
    }

    return {
      ...(parsed as DesignDocDefinition),
      _id: parsed._id ?? fallbackId,
      language: parsed.language ?? 'javascript'
    }
  }
  catch (error: unknown) {
    const err = error as { code?: string, message?: string }
    if (err.code === 'ENOENT') {
      console.warn(`Inventory view definition not found: ${pathParts.join('/')}`)
      return null
    }

    throw new Error(`Failed to load inventory view definition (${pathParts.join('/')}): ${err.message ?? 'Unknown error'}`)
  }
}

/* Upsert a CouchDB design document while preserving current revision control. */
async function upsertDesignDoc(designDoc: DesignDocDefinition): Promise<void> {
  const existing = await couchDB.getDocument<DesignDocDefinition>(designDoc._id)

  if (existing && existing._rev) {
    const nextDoc: DesignDocDefinition = {
      ...existing,
      ...designDoc,
      _id: designDoc._id,
      _rev: existing._rev
    }

    await couchDB.updateDocument(designDoc._id, nextDoc, existing._rev)
    return
  }

  await couchDB.bulkUpdateDocuments<CloudantV1.Document>([designDoc as CloudantV1.Document])
}

/* Generate compact, prefixed IDs for inventory entities and actions. */
export function generateInventoryId(prefix: string): string {
  const safePrefix = prefix.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'inventory'
  const timestamp = Date.now().toString(36)
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `${safePrefix}-${timestamp}-${randomSuffix}`
}

/* Build a child's locationPath from its parent's ancestry + parent node. */
export function buildLocationPath(parent: Room | StorageEquipment | Container): LocationAncestor[] {
  const basePath = parent.type === 'room' ? [] : Array.isArray(parent.locationPath) ? parent.locationPath : []
  const parentAncestor = toLocationAncestor(parent)

  if (basePath.at(-1)?.id === parentAncestor.id) {
    return basePath
  }

  return [...basePath, parentAncestor]
}

/* Resolve a human-readable breadcrumb by batch-fetching ancestor documents. */
export async function resolveLocationBreadcrumb(
  locationPath: LocationAncestor[],
  parentId: string
): Promise<Array<{ id: string, type: string, name: string, label?: string }>> {
  const ancestorIds = locationPath.map(a => a.id)
  if (parentId && !ancestorIds.includes(parentId)) {
    ancestorIds.push(parentId)
  }

  if (ancestorIds.length === 0) {
    return []
  }

  const docs = await couchDB.getDocumentsByIds<LocationEntity & { _id: string }>(ancestorIds)

  const docMap = new Map<string, LocationEntity & { _id: string }>()
  for (const doc of docs) {
    if (doc && isLocationEntity(doc)) {
      docMap.set(doc._id, doc)
    }
  }

  const breadcrumb: Array<{ id: string, type: string, name: string, label?: string }> = []

  for (const ancestor of locationPath) {
    const doc = docMap.get(ancestor.id)
    if (doc) {
      breadcrumb.push({
        id: doc._id,
        type: doc.type,
        name: doc.name,
        label: doc.label ?? undefined
      })
    }
  }

  if (parentId && !locationPath.some(a => a.id === parentId)) {
    const parentDoc = docMap.get(parentId)
    if (parentDoc) {
      breadcrumb.push({
        id: parentDoc._id,
        type: parentDoc.type,
        name: parentDoc.name,
        label: parentDoc.label ?? undefined
      })
    }
  }

  return breadcrumb
}

/* Cascade new ancestry to all descendants after a move/re-parent operation. */
export async function cascadeLocationPathUpdate(
  entityId: string,
  entityType: string,
  newPath: LocationAncestor[]
): Promise<number> {
  try {
    const descendants = await couchDB.queryView<[string, string], unknown, InventoryChildDocument>(
      'firn-inventory',
      'by_ancestor',
      {
        key: [entityType, entityId],
        include_docs: true
      }
    )

    const now = new Date().toISOString()
    const docsToUpdate: InventoryChildDocument[] = []

    for (const row of descendants.rows) {
      const doc = row.doc
      if (!doc || !Array.isArray(doc.locationPath)) {
        continue
      }
      if (!CASCADE_ENTITY_TYPES.includes(doc.type)) {
        continue
      }

      const ancestorIndex = doc.locationPath.findIndex(ancestor => ancestor.id === entityId)
      if (ancestorIndex < 0) {
        continue
      }

      const suffix = doc.locationPath.slice(ancestorIndex + 1)
      const updatedLocationPath = [...newPath, ...suffix]
      if (JSON.stringify(updatedLocationPath) === JSON.stringify(doc.locationPath)) {
        continue
      }

      docsToUpdate.push({
        ...doc,
        locationPath: updatedLocationPath,
        updatedAt: now
      })
    }

    if (docsToUpdate.length === 0) {
      return 0
    }

    const results = await couchDB.bulkUpdateDocuments<CloudantV1.Document>(
      docsToUpdate as unknown as CloudantV1.Document[]
    )

    return results.filter(result => result.ok && !result.error).length
  }
  catch (error: unknown) {
    const err = error as { code?: number }
    if (err.code === 404) {
      return 0
    }
    throw error
  }
}

/* Validate whether a parent location can legally accept a child type/category. */
export function validateContainerAcceptance(
  parent: Container | StorageEquipment,
  childType: 'container' | 'inventoryItem',
  childCategory: string
): { valid: boolean, reason?: string } {
  if (childType === 'container') {
    if (parent.type === 'container') {
      if (parent.containerType === 'bag' || parent.containerType === 'bottle' || parent.containerType === 'jar') {
        return {
          valid: false,
          reason: `Container type "${parent.containerType}" cannot contain other containers.`
        }
      }

      if (parent.acceptedContainerCategories && childCategory) {
        if (!parent.acceptedContainerCategories.includes(childCategory)) {
          return {
            valid: false,
            reason: `Container does not accept container category "${childCategory}". Allowed: ${parent.acceptedContainerCategories.join(', ')}.`
          }
        }
      }
      else if (parent.classification !== 'other' && childCategory && childCategory !== parent.classification) {
        return {
          valid: false,
          reason: `Container classification "${parent.classification}" is incompatible with child category "${childCategory}".`
        }
      }
    }

    return { valid: true }
  }

  if (parent.type === 'container') {
    if (parent.acceptedItemCategories && childCategory) {
      if (!parent.acceptedItemCategories.includes(childCategory)) {
        return {
          valid: false,
          reason: `Container does not accept item category "${childCategory}". Allowed: ${parent.acceptedItemCategories.join(', ')}.`
        }
      }
    }
    else if (parent.classification !== 'other' && childCategory && childCategory !== parent.classification) {
      return {
        valid: false,
        reason: `Container classification "${parent.classification}" is incompatible with child category "${childCategory}".`
      }
    }
  }

  return { valid: true }
}

/* Validate remaining parent capacity before adding a new child. */
export async function validateCapacity(parentId: string, parentCapacity: number | null): Promise<boolean> {
  if (parentCapacity == null) {
    return true
  }

  if (!Number.isFinite(parentCapacity) || parentCapacity <= 0) {
    return false
  }

  const children = await couchDB.queryDocuments<CloudantV1.Document>(
    {
      parentId,
      type: { $in: CASCADE_ENTITY_TYPES }
    },
    ['_id']
  )

  return children.length < parentCapacity
}

/* Validate grid coordinates are in-bounds and unoccupied among siblings. */
export async function validateGridPosition(
  parentId: string,
  position: GridPosition,
  gridRows: number,
  gridCols: number,
  excludeChildId?: string
): Promise<{ valid: boolean, reason?: string }> {
  if (!Number.isInteger(position.row) || !Number.isInteger(position.column)) {
    return { valid: false, reason: 'Grid position row and column must be integers.' }
  }

  if (position.row < 1 || position.row > gridRows || position.column < 1 || position.column > gridCols) {
    return {
      valid: false,
      reason: `Grid position (${position.row}, ${position.column}) is out of bounds for ${gridRows}x${gridCols}.`
    }
  }

  if (position.level != null && (!Number.isInteger(position.level) || position.level < 1)) {
    return { valid: false, reason: 'Grid position level must be a positive integer.' }
  }

  const siblings = await couchDB.queryDocuments<InventoryChildDocument>(
    {
      parentId,
      type: { $in: CASCADE_ENTITY_TYPES }
    },
    ['_id', 'position']
  )

  const conflict = siblings.find((sibling) => {
    if (!sibling || sibling._id === excludeChildId || !sibling.position) {
      return false
    }

    return (
      sibling.position.row === position.row
      && sibling.position.column === position.column
      && (sibling.position.level ?? null) === (position.level ?? null)
    )
  })

  if (conflict) {
    return {
      valid: false,
      reason: `Grid position is already occupied by document ${conflict._id}.`
    }
  }

  return { valid: true }
}

/* Ensure both inventory design-doc view sets are available in CouchDB. */
export async function ensureInventoryViews(): Promise<void> {
  const designDocs = await Promise.all([
    loadDesignDoc(['docs', 'couchdb-views', 'firn-inventory.json'], '_design/firn-inventory'),
    loadDesignDoc(['docs', 'couchdb-views', 'firn-inventory-actions.json'], '_design/firn-inventory-actions')
  ])

  for (const designDoc of designDocs) {
    if (!designDoc) {
      continue
    }

    await upsertDesignDoc(designDoc)
  }
}
