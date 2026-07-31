<script setup lang="ts">
const props = defineProps<{
  rows: number
  columns: number
  /* Number of occupied cells in this level, filled row-major (approximate fullness). */
  filled: number
}>()

/* Lab-convention row label: A, B, … Z, then AA, AB, … */
function rowLabel(rowIndex: number): string {
  let n = rowIndex
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

function isOccupied(rowIndex: number, colIndex: number): boolean {
  return rowIndex * props.columns + colIndex < props.filled
}

function slotLabel(rowIndex: number, colIndex: number): string {
  return `${rowLabel(rowIndex)}${colIndex + 1}`
}

const rowIndices = computed(() => Array.from({ length: props.rows }, (_, i) => i))
const colIndices = computed(() => Array.from({ length: props.columns }, (_, i) => i))
</script>

<template>
  <div class="overflow-x-auto">
    <div class="inline-block">
      <!-- Column header -->
      <div class="flex">
        <div class="w-6 h-5 shrink-0" />
        <div
          v-for="col in colIndices"
          :key="`col-${col}`"
          class="w-6 h-5 shrink-0 flex items-center justify-center text-[10px] font-medium text-muted tabular-nums"
        >
          {{ col + 1 }}
        </div>
      </div>

      <!-- Grid rows -->
      <div
        v-for="row in rowIndices"
        :key="`row-${row}`"
        class="flex"
      >
        <div class="w-6 h-6 shrink-0 flex items-center justify-center text-[10px] font-medium text-muted">
          {{ rowLabel(row) }}
        </div>
        <div
          v-for="col in colIndices"
          :key="`cell-${row}-${col}`"
          class="w-6 h-6 shrink-0 p-0.5"
        >
          <NTooltip :content="`${slotLabel(row, col)} — ${isOccupied(row, col) ? 'occupied' : 'free'}`">
            <div
              class="w-full h-full rounded-sm border transition-colors"
              :class="isOccupied(row, col)
                ? 'bg-primary-500 dark:bg-primary-600 border-primary-600 dark:border-primary-500'
                : 'bg-transparent border-primary-200 dark:border-primary-800'"
            />
          </NTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
