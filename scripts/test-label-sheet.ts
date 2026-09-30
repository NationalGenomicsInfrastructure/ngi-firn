#!/usr/bin/env node
/*
 * Unit test for the batch label sheet geometry (no database needed).
 *
 * Run with: pnpm test:labels
 */

import {
  A4_HEIGHT,
  A4_WIDTH,
  LABEL_SHEET_PRESETS,
  computeSheetLayout,
  cutMarkSegments
} from '../app/utils/inventory/labelSheet'

let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  }
  else {
    failures.push(label)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

for (const preset of Object.values(LABEL_SHEET_PRESETS)) {
  console.log(`\n${preset.id}`)
  const one = computeSheetLayout(preset, 1)
  check('grid fits inside the printable page',
    one.gridX >= 0 && one.gridX + one.cols * one.cellWidth <= A4_WIDTH
    && one.gridY + one.rows * one.cellHeight <= A4_HEIGHT)

  const exact = computeSheetLayout(preset, one.perPage)
  check('a full page yields exactly one page', exact.pages.length === 1)

  const overflow = computeSheetLayout(preset, one.perPage + 1)
  check('one label over a full page adds a second page with one row',
    overflow.pages.length === 2 && overflow.pages[1]!.count === 1 && overflow.pages[1]!.usedRows === 1)

  const empty = computeSheetLayout(preset, 0)
  check('no labels yields no pages', empty.pages.length === 0)

  const marks = cutMarkSegments(overflow, 0)
  const gridRight = overflow.gridX + overflow.cols * overflow.cellWidth
  const gridBottom = overflow.gridY + overflow.rows * overflow.cellHeight
  const insideGrid = marks.some(m =>
    Math.min(m.x1, m.x2) > overflow.gridX && Math.max(m.x1, m.x2) < gridRight
    && Math.min(m.y1, m.y2) > overflow.gridY && Math.max(m.y1, m.y2) < gridBottom
  )
  check('cut marks stay outside the grid interior', !insideGrid)
  check('cut marks stay on the page',
    marks.every(m => Math.min(m.x1, m.y1) >= 0 && Math.max(m.x2, m.x1) <= A4_WIDTH && Math.max(m.y1, m.y2) <= A4_HEIGHT))
  check('gapped presets get two cut marks per gap',
    preset.gapMm === 0
    || marks.filter(m => m.y2 < overflow.gridY).length === overflow.cols * 2)
  check('a partial last page only marks its used rows',
    cutMarkSegments(overflow, 1).filter(m => Math.abs(m.x1 - (overflow.gridX + overflow.gap / 2 - 8)) < 0.01).length === 2)
}

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) process.exit(1)
