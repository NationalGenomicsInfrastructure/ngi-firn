/*
 * ContainerService - Table of Contents
 * ************************************
 *
 * SCOPE NOTE
 * This module currently lands the *occupancy-maintenance core* — the novel part of
 * container CRUD, i.e. how the server-owned `stored` count is kept for both numeric
 * ('count') and positional ('grid') capacity layouts. The remaining lifecycle methods
 * (createContainer / updateContainer / deleteContainer / moveContainer / suggestLocations)
 * mirror EquipmentService in equipment.server.ts and are deferred to a follow-up.
 *
 * TYPE GUARDS AND RETRIEVAL:
 * isContainer(doc) - Check whether a fetched document is a Container
 * getContainer(id) - Fetch one container document by ID
 *
 * CAPACITY VALIDATION:
 * validateAndJoinContainerCapacity(existing, updates) - Merge capacity-limit edits, preserving `stored`
 *
 * OCCUPANCY MAINTENANCE (server-owned `stored`):
 * adjustStoredCount(containerId, category, delta) - count-layout: increment/decrement a category's count
 * adjustOccupancy(containerId, position, delta) - grid-layout: occupy/free a slot with bounds + collision checks
 */

import { couchDB } from '../../database/couchdb'
import { isWithinGrid } from './grid.server'
import type { Container } from '../../../types/inventory'
import type {
  ContainerCapacity,
  ContainerCapacityEntry
} from '~~/schemas/inventory/container'

/* Total slots a capacity entry represents (grid: rows×columns×levels, count: capacity). */
function totalSlots(entry: ContainerCapacity | ContainerCapacityEntry): number {
  return entry.layout === 'grid'
    ? entry.rows * entry.columns * (entry.levels ?? 1)
    : entry.capacity
}

/* Check if a document is a Container document. */
function isContainer(doc: unknown): doc is Container {
  if (!doc || typeof doc !== 'object') {
    return false
  }
  return (doc as Partial<Container>).type === 'container'
}

/* Value emitted by the grid_occupancy view for one occupied slot. */
type GridSlotValue = { slug: string | null, type: string }

/*
 * Whether a specific slot in a parent grid is already occupied, per the
 * grid_occupancy view (children are the authoritative source of positions).
 */
async function isSlotOccupied(
  parentDocumentId: string,
  position: { row: number, column: number, level?: number }
): Promise<boolean> {
  const result = await couchDB.queryView<[string, number, number, number], GridSlotValue>(
    'firn-inventory',
    'grid_occupancy',
    {
      key: [parentDocumentId, position.level ?? 1, position.row, position.column],
      reduce: false
    }
  )
  return result.rows.length > 0
}

export const ContainerService = {

  /* Fetch one container document by document ID. */
  async getContainer(containerDocumentId: string): Promise<Container | null> {
    const container = await couchDB.getDocument<Container>(containerDocumentId)
    return isContainer(container) ? container : null
  },

  /*
   * Validate and merge capacity restrictions while preserving stored counts.
   * Analogous to EquipmentService.validateAndJoinContainerCapacity: types with an
   * existing entry keep their `stored`, newly declared types start at `stored: 0`,
   * and existing types missing from `updates` are dropped. A new limit must not fall
   * below what is already stored (for grids: below the number of occupied slots).
   * The XOR between grid and count layouts is enforced upstream by the zod
   * containerCapacityArraySchema, so this only guards the per-entry limits.
   */
  validateAndJoinContainerCapacity(
    existing: Container['capacity'],
    updates: ContainerCapacity[]
  ): ContainerCapacityEntry[] {
    const existingByType = new Map((existing ?? []).map(entry => [entry.type, entry]))
    const merged: ContainerCapacityEntry[] = []

    for (const entry of updates) {
      const stored = existingByType.get(entry.type)?.stored ?? 0
      const total = totalSlots(entry)

      if (total < stored) {
        throw new Error(
          `Cannot set capacity for category "${entry.type}" to ${total}: ${stored} are already stored.`
        )
      }

      if (entry.layout === 'grid') {
        merged.push({
          layout: 'grid',
          childKind: entry.childKind,
          type: entry.type,
          rows: entry.rows,
          columns: entry.columns,
          levels: entry.levels ?? 1,
          stored
        })
      }
      else {
        merged.push({
          layout: 'count',
          childKind: entry.childKind,
          type: entry.type,
          capacity: entry.capacity,
          stored
        })
      }
    }

    return merged
  },

  /*
   * Adjust the stored count for a numeric ('count'-layout) capacity category.
   * Mirrors EquipmentService.adjustStoredCount:
   *  - If the category has no count entry, nothing is tracked (atCapacity: false).
   *  - Throws when delta would push stored below 0 or above the defined capacity.
   */
  async adjustStoredCount(
    containerDocumentId: string,
    category: string,
    delta: number
  ): Promise<{ container: Container, atCapacity: boolean }> {
    const container = await ContainerService.getContainer(containerDocumentId)
    if (!container) {
      throw new Error(`Container with ID "${containerDocumentId}" not found.`)
    }

    const entry = container.capacity?.find(
      capacityEntry => capacityEntry.layout === 'count' && capacityEntry.type === category
    )

    // No count entry for this category — nothing to track, no cap to enforce.
    if (!entry || entry.layout !== 'count') {
      return { container, atCapacity: false }
    }

    const newStored = entry.stored + delta
    if (newStored < 0) {
      throw new Error(
        `Cannot decrement stored count for "${category}" below zero (current: ${entry.stored}).`
      )
    }
    if (newStored > entry.capacity) {
      throw new Error(
        `Cannot store another "${category}" in container "${container.slug}": capacity of ${entry.capacity} is already reached.`
      )
    }

    return {
      container: await writeCapacity(container, entry.type, newStored),
      atCapacity: newStored === entry.capacity
    }
  },

  /*
   * Occupy (delta > 0) or free (delta < 0) a slot in a grid ('grid'-layout) container.
   * Validates the position is within the declared grid, and on occupy that the target
   * slot is free (per grid_occupancy). Increments/decrements the grid entry's `stored`.
   *
   * NOTE: CouchDB has no multi-document transactions. The caller must write the child's
   * GridPosition FIRST and then call this to bump the parent counter — if this write
   * fails, the grid_occupancy view (fed by the child) remains the source of truth and
   * the counter is reconcilable. Uses read-modify-write on `_rev`; on a 409 conflict the
   * caller should re-fetch and retry.
   */
  async adjustOccupancy(
    containerDocumentId: string,
    position: { row: number, column: number, level?: number },
    delta: number
  ): Promise<{ container: Container, atCapacity: boolean }> {
    const container = await ContainerService.getContainer(containerDocumentId)
    if (!container) {
      throw new Error(`Container with ID "${containerDocumentId}" not found.`)
    }

    const entry = container.capacity?.find(capacityEntry => capacityEntry.layout === 'grid')
    if (!entry || entry.layout !== 'grid') {
      throw new Error(`Container "${container.slug}" has no grid layout to occupy.`)
    }

    if (!isWithinGrid(position, { rows: entry.rows, columns: entry.columns, levels: entry.levels ?? 1 })) {
      throw new Error(
        `Position (row ${position.row}, column ${position.column}, level ${position.level ?? 1}) is outside the ${entry.rows}×${entry.columns}×${entry.levels ?? 1} grid of "${container.slug}".`
      )
    }

    if (delta > 0 && await isSlotOccupied(containerDocumentId, position)) {
      throw new Error(
        `Slot (row ${position.row}, column ${position.column}, level ${position.level ?? 1}) in "${container.slug}" is already occupied.`
      )
    }

    const total = totalSlots(entry)
    const newStored = entry.stored + delta
    if (newStored < 0) {
      throw new Error(`Cannot free a slot in "${container.slug}": grid is already empty.`)
    }
    if (newStored > total) {
      throw new Error(`Cannot occupy another slot in "${container.slug}": all ${total} slots are full.`)
    }

    return {
      container: await writeCapacity(container, entry.type, newStored),
      atCapacity: newStored === total
    }
  }
}

/* Write back the container with `stored` updated for the entry matching `type`. */
async function writeCapacity(
  container: Container,
  type: string,
  newStored: number
): Promise<Container> {
  const updated: Container = {
    ...container,
    capacity: (container.capacity ?? []).map(entry =>
      entry.type === type ? { ...entry, stored: newStored } : entry
    ),
    updatedAt: new Date().toISOString()
  }

  const result = await couchDB.updateDocument(container._id, updated, container._rev)
  updated._rev = result.rev
  return updated
}
