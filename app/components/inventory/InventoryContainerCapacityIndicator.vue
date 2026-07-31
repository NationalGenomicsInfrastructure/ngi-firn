<script setup lang="ts">
import type { ContainerCapacityEntry } from '~~/schemas/inventory/container'
import { getChildTypeMeta } from '~/utils/inventory/item'

const props = defineProps<{
  capacity: ContainerCapacityEntry[] | null
}>()

interface CountDisplayRow {
  key: string
  label: string
  icon: string
  value: string
  valueClass?: string
}

interface GridLevelData {
  level: number
  filled: number
}

interface GridDisplay {
  label: string
  icon: string
  rows: number
  columns: number
  levels: number
  stored: number
  total: number
  levelsData: GridLevelData[]
}

const layout = computed<'count' | 'grid' | null>(() => props.capacity?.[0]?.layout ?? null)

// Count layout: one or more numeric caps per child category.
const countRows = computed<CountDisplayRow[]>(() => {
  if (!props.capacity || layout.value !== 'count') return []

  return props.capacity
    .filter(entry => entry.layout === 'count')
    .map((entry) => {
      const meta = getChildTypeMeta(entry.childKind, entry.type)
      return {
        key: `${entry.childKind}-${entry.type}`,
        label: meta.label,
        icon: meta.icon,
        value: `${entry.stored} / ${entry.capacity}`,
        valueClass: entry.capacity === 0 ? 'text-muted' : undefined
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
})

// Grid layout: exactly one positional entry.
const grid = computed<GridDisplay | null>(() => {
  const entry = props.capacity?.find(e => e.layout === 'grid')
  if (!entry || entry.layout !== 'grid') return null

  const meta = getChildTypeMeta(entry.childKind, entry.type)
  const cellsPerLevel = entry.rows * entry.columns
  const total = cellsPerLevel * entry.levels

  // Distribute the aggregate occupancy count level-major: fill level 1 fully, then level 2, …
  const levelsData: GridLevelData[] = Array.from({ length: entry.levels }, (_, levelIndex) => ({
    level: levelIndex + 1,
    filled: Math.max(0, Math.min(cellsPerLevel, entry.stored - levelIndex * cellsPerLevel))
  }))

  return {
    label: meta.label,
    icon: meta.icon,
    rows: entry.rows,
    columns: entry.columns,
    levels: entry.levels,
    stored: entry.stored,
    total,
    levelsData
  }
})

const isEmpty = computed(() => !props.capacity || props.capacity.length === 0)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <NIcon
        name="i-lucide-package-open"
        class="text-muted"
      />
      <h4 class="text-sm font-semibold">
        Occupancy and Capacity
      </h4>
    </div>

    <!-- Empty -->
    <p
      v-if="isEmpty"
      class="text-sm text-muted"
    >
      No capacity configured.
    </p>

    <!-- Count layout -->
    <div
      v-else-if="layout === 'count'"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm"
    >
      <IndicatorIconText
        v-for="row in countRows"
        :key="row.key"
        :icon="row.icon"
        :label="row.label"
        :value="row.value"
        :value-class="row.valueClass"
      />
    </div>

    <!-- Grid layout -->
    <div
      v-else-if="grid"
      class="space-y-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <NBadge
          :icon="grid.icon"
          :label="grid.label"
          badge="soft-primary"
        />
        <NBadge
          :label="grid.levels > 1
            ? `${grid.rows} × ${grid.columns} × ${grid.levels}`
            : `${grid.rows} × ${grid.columns}`"
          badge="outline"
        />
        <NBadge
          :label="`${grid.stored} / ${grid.total} occupied`"
          :badge="grid.stored >= grid.total ? 'solid-error' : 'solid-success'"
        />
      </div>

      <p class="text-xs text-muted italic">
        Filled cells show the number of occupied slots, not their exact positions.
      </p>

      <!-- Multiple levels: tab switcher -->
      <NTabs
        v-if="grid.levels > 1"
        :default-value="`level-1`"
      >
        <NTabsList>
          <NTabsTrigger
            v-for="lvl in grid.levelsData"
            :key="`trigger-${lvl.level}`"
            :value="`level-${lvl.level}`"
          >
            Level {{ lvl.level }}
          </NTabsTrigger>
        </NTabsList>
        <NTabsContent
          v-for="lvl in grid.levelsData"
          :key="`content-${lvl.level}`"
          :value="`level-${lvl.level}`"
          class="mt-3"
        >
          <InventoryCapacityGrid
            :rows="grid.rows"
            :columns="grid.columns"
            :filled="lvl.filled"
          />
        </NTabsContent>
      </NTabs>

      <!-- Single level -->
      <InventoryCapacityGrid
        v-else
        :rows="grid.rows"
        :columns="grid.columns"
        :filled="grid.levelsData[0]?.filled ?? 0"
      />
    </div>
  </div>
</template>
