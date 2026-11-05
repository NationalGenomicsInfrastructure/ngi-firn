<script setup lang="ts">
import type { GridOccupancyCell } from '~~/server/crud/inventory/grid.server'
import type { GridDropDetail } from '~/composables/useGridDrag'
import { useGridDrag } from '~/composables/useGridDrag'
import { cellKey, gridLabel, rowToLetters, sameCell, type GridCoordinate } from '~/utils/inventory/grid'

/*
 * One level of a positional grid.
 *  - view:   read-only, hover tooltips.
 *  - drag:   occupied cells can be dragged (pointer events, mouse + touch) and any cell is a drop target.
 *  - select: free cells can be toggled (click) to choose a position, e.g. when creating a child.
 */
const props = withDefaults(defineProps<{
  rows: number
  columns: number
  level?: number
  /* Slug of the grid container; scopes drops and identifies the drag source. */
  parentSlug: string
  cells: GridOccupancyCell[]
  mode?: 'view' | 'drag' | 'select'
  /* Select mode: how many cells may be selected at once (1 behaves like a radio group). */
  maxSelect?: number
}>(), {
  level: 1,
  mode: 'view',
  maxSelect: 1
})

const emit = defineEmits<{
  drop: [detail: GridDropDetail]
  open: [cell: GridOccupancyCell]
}>()

const selected = defineModel<GridCoordinate[]>('selected', { default: () => [] })

const { startDrag, isDragging, overCell, payload } = useGridDrag()

const occupantByKey = computed(() => {
  const map = new Map<string, GridOccupancyCell>()
  for (const cell of props.cells) {
    if (cell.level === props.level) map.set(cellKey(cell), cell)
  }
  return map
})

const rowNumbers = computed(() => Array.from({ length: props.rows }, (_, i) => i + 1))
const colNumbers = computed(() => Array.from({ length: props.columns }, (_, i) => i + 1))

function coordinate(row: number, column: number): GridCoordinate {
  return { level: props.level, row, column }
}

function occupantAt(row: number, column: number) {
  return occupantByKey.value.get(cellKey(coordinate(row, column)))
}

function isSelected(row: number, column: number) {
  const target = coordinate(row, column)
  return selected.value.some(entry => sameCell(entry, target))
}

function isDropHover(row: number, column: number) {
  const over = overCell.value
  return isDragging.value && over != null && over.gridId === props.parentSlug
    && sameCell(over, coordinate(row, column))
}

function tooltip(row: number, column: number): string {
  const label = gridLabel(row, column, props.level)
  const occupant = occupantAt(row, column)
  if (!occupant) return `${label} — free`
  const kind = occupant.type === 'container' ? 'container' : 'item'
  return `${label} — ${occupant.slug ?? 'unnamed'} (${kind})`
}

function onPointerDown(event: PointerEvent, row: number, column: number) {
  if (props.mode !== 'drag') return
  const occupant = occupantAt(row, column)
  if (!occupant?.slug) return
  startDrag(event, {
    kind: occupant.type === 'container' ? 'container' : 'item',
    slug: occupant.slug,
    label: occupant.slug,
    fromParentSlug: props.parentSlug
  })
}

function onClick(row: number, column: number) {
  const occupant = occupantAt(row, column)
  if (props.mode === 'select') {
    if (occupant) return
    const target = coordinate(row, column)
    if (isSelected(row, column)) {
      selected.value = selected.value.filter(entry => !sameCell(entry, target))
    }
    else if (props.maxSelect <= 1) {
      selected.value = [target]
    }
    else if (selected.value.length < props.maxSelect) {
      selected.value = [...selected.value, target]
    }
    return
  }
  if (occupant) emit('open', occupant)
}

function onGridDrop(event: Event) {
  const detail = (event as CustomEvent<GridDropDetail>).detail
  if (props.mode !== 'drag' || detail.gridId !== props.parentSlug) return
  emit('drop', detail)
}

function cellClass(row: number, column: number): string {
  const occupied = occupantAt(row, column) != null
  if (isSelected(row, column)) return 'bg-success-500 border-success-600 ring-2 ring-success-300'
  if (isDropHover(row, column)) {
    return occupied
      ? 'bg-error-400 border-error-600'
      : 'bg-success-300 border-success-600 ring-2 ring-success-400'
  }
  if (occupied) {
    return payload.value?.slug === occupantAt(row, column)?.slug && isDragging.value
      ? 'bg-primary-300 border-primary-400 opacity-50'
      : 'bg-primary-500 dark:bg-primary-600 border-primary-600 dark:border-primary-500'
  }
  return 'bg-transparent border-primary-200 dark:border-primary-800'
}

function cursorClass(row: number, column: number): string {
  const occupied = occupantAt(row, column) != null
  if (props.mode === 'drag' && occupied) return 'cursor-grab touch-none'
  if (props.mode === 'select' && !occupied) return 'cursor-pointer'
  if (occupied && props.mode !== 'view') return 'cursor-pointer'
  return ''
}
</script>

<template>
  <div class="overflow-x-auto">
    <div class="inline-block select-none">
      <!-- Column header -->
      <div class="flex">
        <div class="w-6 h-5 shrink-0" />
        <div
          v-for="col in colNumbers"
          :key="`col-${col}`"
          class="w-6 h-5 shrink-0 flex items-center justify-center text-[10px] font-medium text-muted tabular-nums"
        >
          {{ col }}
        </div>
      </div>

      <!-- Grid rows -->
      <div
        v-for="row in rowNumbers"
        :key="`row-${row}`"
        class="flex"
      >
        <div class="w-6 h-6 shrink-0 flex items-center justify-center text-[10px] font-medium text-muted">
          {{ rowToLetters(row) }}
        </div>
        <div
          v-for="col in colNumbers"
          :key="`cell-${row}-${col}`"
          class="w-6 h-6 shrink-0 p-0.5"
          data-grid-cell
          :data-grid-id="parentSlug"
          :data-level="level"
          :data-row="row"
          :data-column="col"
          @grid-drop="onGridDrop"
        >
          <NTooltip :content="tooltip(row, col)">
            <div
              class="w-full h-full rounded-sm border transition-colors"
              :class="[cellClass(row, col), cursorClass(row, col)]"
              :role="mode === 'select' ? 'checkbox' : undefined"
              :aria-checked="mode === 'select' ? isSelected(row, col) : undefined"
              :aria-label="tooltip(row, col)"
              @pointerdown="onPointerDown($event, row, col)"
              @click="onClick(row, col)"
            />
          </NTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
