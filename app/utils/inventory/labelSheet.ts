/*
 * Geometry of batch barcode label sheets.
 * ***************************************
 *
 * Pure arithmetic, deliberately free of pdfmake and the DOM so it can be unit-tested
 * (see scripts/test-label-sheet.ts). The composable turns this layout into a PDF.
 *
 * Labels are laid out as a gapless grid on A4, centred horizontally and anchored at
 * the top margin. Cut marks are short ticks in the page margin at every column and
 * row boundary of the used grid, so they never touch a symbol.
 */

/* PostScript points (1 pt = 1/72 inch). */
const PT_PER_MM = 72 / 25.4
export const A4_WIDTH = 595.28
export const A4_HEIGHT = 841.89

const PAGE_MARGIN = 10 * PT_PER_MM
const MARK_LENGTH = 6
const MARK_OFFSET = 2
/* Keeps the last row from spilling onto a blank extra page through rounding. */
const FIT_EPSILON = 0.5

export type LabelSheetPresetId = 'compact' | 'medium' | 'large'

export interface LabelSheetPreset {
  id: LabelSheetPresetId
  label: string
  widthMm: number
  heightMm: number
  /* Horizontal space between neighbouring labels, so their edges are distinguishable. */
  gapMm: number
  /* Print the entity name above the symbol; only sensible when the label is tall enough. */
  showCaption: boolean
  captionMaxChars: number
  /* Canvas options handed to renderBarcodeDataUrl. */
  render: { width: number, height: number, margin: number, fontSize: number }
}

export const LABEL_SHEET_PRESETS: Record<LabelSheetPresetId, LabelSheetPreset> = {
  compact: {
    id: 'compact',
    label: 'Compact — 30 × 5 mm',
    widthMm: 30,
    heightMm: 5,
    gapMm: 3,
    showCaption: false,
    captionMaxChars: 0,
    render: { width: 2, height: 22, margin: 2, fontSize: 10 }
  },
  medium: {
    id: 'medium',
    label: 'Medium — 40 × 10 mm',
    widthMm: 40,
    heightMm: 10,
    gapMm: 3,
    showCaption: true,
    captionMaxChars: 28,
    render: { width: 2, height: 36, margin: 2, fontSize: 12 }
  },
  large: {
    id: 'large',
    label: 'Large — 50 × 25 mm',
    widthMm: 50,
    heightMm: 25,
    gapMm: 3,
    showCaption: true,
    captionMaxChars: 36,
    render: { width: 2, height: 50, margin: 2, fontSize: 14 }
  }
}

export const DEFAULT_LABEL_SHEET_PRESET: LabelSheetPresetId = 'compact'

export interface SheetPage {
  /* Index of this page's first label in the overall label list. */
  start: number
  count: number
  /* Rows actually occupied; a partial last page only gets its used rows. */
  usedRows: number
}

export interface SheetLayout {
  /* Width of the symbol area of one label. */
  labelWidth: number
  /* Horizontal space between neighbouring labels. */
  gap: number
  /* Column pitch: label width plus the gap. The gap is split evenly around each label. */
  cellWidth: number
  cellHeight: number
  cols: number
  rows: number
  perPage: number
  /* Top-left corner of the grid on the page. */
  gridX: number
  gridY: number
  pages: SheetPage[]
}

export interface CutMark { x1: number, y1: number, x2: number, y2: number }

export function computeSheetLayout(preset: LabelSheetPreset, count: number): SheetLayout {
  const labelWidth = preset.widthMm * PT_PER_MM
  const gap = preset.gapMm * PT_PER_MM
  const cellWidth = labelWidth + gap
  const cellHeight = preset.heightMm * PT_PER_MM

  const cols = Math.floor((A4_WIDTH - 2 * PAGE_MARGIN - FIT_EPSILON) / cellWidth)
  const rows = Math.floor((A4_HEIGHT - 2 * PAGE_MARGIN - FIT_EPSILON) / cellHeight)
  if (cols < 1 || rows < 1) throw new Error(`Label size ${preset.id} does not fit on an A4 page.`)

  const perPage = cols * rows
  const pages: SheetPage[] = []
  for (let start = 0; start < count; start += perPage) {
    const pageCount = Math.min(perPage, count - start)
    pages.push({ start, count: pageCount, usedRows: Math.ceil(pageCount / cols) })
  }

  return {
    labelWidth,
    gap,
    cellWidth,
    cellHeight,
    cols,
    rows,
    perPage,
    gridX: (A4_WIDTH - cols * cellWidth) / 2,
    gridY: PAGE_MARGIN,
    pages
  }
}

/*
 * Crop marks for one page: a tick above and below every label edge (two per gap, so
 * the cut can go either side) and a tick left and right of every row boundary, all in
 * the margin outside the used grid.
 * Columns span the full grid width even on a partial last row (labels there are
 * simply absent), so the vertical marks never depend on the label count.
 */
export function cutMarkSegments(layout: SheetLayout, pageIndex: number): CutMark[] {
  const page = layout.pages[pageIndex]
  if (!page) return []

  const { cellWidth, cellHeight, labelWidth, gap, cols, gridX, gridY } = layout
  const left = gridX + gap / 2
  const right = gridX + (cols - 1) * cellWidth + gap / 2 + labelWidth
  const top = gridY
  const bottom = gridY + page.usedRows * cellHeight
  const marks: CutMark[] = []

  const xs: number[] = []
  for (let c = 0; c < cols; c++) {
    const labelLeft = gridX + c * cellWidth + gap / 2
    xs.push(labelLeft, labelLeft + labelWidth)
  }
  // Without a gap, one label's right edge is the next one's left edge.
  for (const x of xs.filter((value, i) => i === 0 || Math.abs(value - xs[i - 1]!) > 0.01)) {
    marks.push({ x1: x, y1: top - MARK_OFFSET - MARK_LENGTH, x2: x, y2: top - MARK_OFFSET })
    marks.push({ x1: x, y1: bottom + MARK_OFFSET, x2: x, y2: bottom + MARK_OFFSET + MARK_LENGTH })
  }
  for (let r = 0; r <= page.usedRows; r++) {
    const y = gridY + r * cellHeight
    marks.push({ x1: left - MARK_OFFSET - MARK_LENGTH, y1: y, x2: left - MARK_OFFSET, y2: y })
    marks.push({ x1: right + MARK_OFFSET, y1: y, x2: right + MARK_OFFSET + MARK_LENGTH, y2: y })
  }
  return marks
}
