/*
 * Grid helpers — pure functions for positional (grid-layout) containers.
 *
 * A grid container declares its dimensions on its single 'grid'-layout capacity
 * entry (see schemas/inventory/container.ts). Children record their slot in a
 * GridPosition; these helpers derive the human-readable label and validate bounds.
 */

export interface GridDimensions {
  rows: number
  columns: number
  levels: number
}

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
