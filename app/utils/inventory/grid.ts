/*
 * Client-side grid helpers. Positions are 1-based (row, column, level), exactly as stored
 * on children and returned by `getGridOccupancy`.
 *
 * `gridLabel` MUST stay in sync with `deriveGridLabel` in server/crud/inventory/grid.server.ts
 * so tooltips show the same label that is persisted on the child ("A3", "L2-B5").
 */

export interface GridCoordinate {
  level: number
  row: number
  column: number
}

/* Spreadsheet-style row letters: 1→A, 26→Z, 27→AA. */
export function rowToLetters(row: number): string {
  let remaining = row
  let letters = ''
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return letters
}

export function gridLabel(row: number, column: number, level = 1): string {
  const base = `${rowToLetters(row)}${column}`
  return level > 1 ? `L${level}-${base}` : base
}

export function cellKey(coordinate: GridCoordinate): string {
  return `${coordinate.level}:${coordinate.row}:${coordinate.column}`
}

export function sameCell(a: GridCoordinate, b: GridCoordinate): boolean {
  return a.level === b.level && a.row === b.row && a.column === b.column
}
