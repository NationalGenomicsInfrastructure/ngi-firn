/*
 * Grid Helpers - Table of Contents
 * ************************************
 *
 *
 * LABEL AND BOUNDS:
 * deriveGridLabel(row, column, level?) - Convert a 1-based position to a spreadsheet-style label (e.g. "A3", "L2-B5")
 * isWithinGrid(position, dimensions) - Validate that a position falls inside the declared grid bounds
 *
 * CAPACITY:
 * totalSlots(entry) - Total slots a capacity entry represents (grid: rows×columns×levels; count: capacity)
 *
 * OCCUPANCY QUERIES:
 * isSlotOccupied(parentDocumentId, position) - Check whether a specific grid slot is already occupied via the grid_occupancy view
 */

/*
 * Pure functions for positional (grid-layout) containers.
 *
 * A grid container declares its dimensions on its single 'grid'-layout capacity
 * entry (see schemas/inventory/container.ts). Children record their slot in a
 * GridPosition; these helpers derive the human-readable label and validate bounds.
 */

import type { ContainerCapacity, ContainerCapacityEntry } from '~~/schemas/inventory/container'
import { couchDB } from '~~/server/database/couchdb'
import type {
  GridPosition,
  GridDimensions
} from '../../../types/inventory'

/* Convert a 1-based row index to spreadsheet-style letters: 1→A, 26→Z, 27→AA. */
function rowToLetters(row: number): string {
  let remaining = row
  let letters = ''
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return letters
}

/*
 * Derive a human-readable slot label from a grid position, using the lab
 * convention of row-letter + column-number (e.g. row 1, col 3 → "A3"; a 96-well
 * plate spans A1…H12). Multi-level grids are prefixed with the level ("L2-A3").
 * This fulfils the GridPosition.label "derived if omitted" contract.
 */
export function deriveGridLabel(row: number, column: number, level?: number): string {
  const base = `${rowToLetters(row)}${column}`
  return level && level > 1 ? `L${level}-${base}` : base
}

/* Whether a position falls within the declared grid dimensions (all 1-based). */
export function isWithinGrid(
  position: { row: number, column: number, level?: number },
  dimensions: GridDimensions
): boolean {
  const level = position.level ?? 1
  return (
    position.row >= 1 && position.row <= dimensions.rows
    && position.column >= 1 && position.column <= dimensions.columns
    && level >= 1 && level <= dimensions.levels
  )
}

/* Total slots a capacity entry represents (grid: rows×columns×levels, count: capacity). */
export function totalSlots(entry: ContainerCapacity | ContainerCapacityEntry): number {
  return entry.layout === 'grid'
    ? entry.rows * entry.columns * (entry.levels ?? 1)
    : entry.capacity
}

/* Value emitted by the grid_occupancy view for one occupied slot. */
export type GridSlotValue = { slug: string | null, type: string }

/*
 * Whether a specific slot in a parent grid is already occupied, per the
 * grid_occupancy view (children are the authoritative source of positions).
 */
export async function isSlotOccupied(
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

/*
 * Scan a grid entry row-major (level → row → column ascending) and return the first
 * free slot per the grid_occupancy view, or null when the grid is fully occupied.
 * Row-major means A1, A2, … across a row before moving to the next row.
 */
export async function findFirstFreeGridSlot(
  parentDocumentId: string,
  entry: Extract<ContainerCapacityEntry, { layout: 'grid' }>
): Promise<GridPosition | null> {
  const levels = entry.levels ?? 1
  for (let level = 1; level <= levels; level++) {
    for (let row = 1; row <= entry.rows; row++) {
      for (let column = 1; column <= entry.columns; column++) {
        const position = { row, column, level }
        if (!(await isSlotOccupied(parentDocumentId, position))) {
          return { row, column, level, label: deriveGridLabel(row, column, level) }
        }
      }
    }
  }
  return null
}
