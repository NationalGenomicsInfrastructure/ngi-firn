<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { ContainerCapacityEntry } from '~~/schemas/inventory/container'
import type { GridDragPayload, GridDropDetail } from '~/composables/useGridDrag'
import { getChildTypeMeta } from '~/utils/inventory/item'
import { gridOccupancyQuery } from '~/utils/queries/inventory/containers'
import { cellKey, gridLabel, type GridCoordinate } from '~/utils/inventory/grid'

const props = defineProps<{
  /* Slug of the container whose capacity is shown; scopes the occupancy query and drops. */
  slug: string
  capacity: ContainerCapacityEntry[] | null
}>()

const { showError } = useFirnToast()
const router = useRouter()

interface CountDisplayRow {
  key: string
  label: string
  icon: string
  value: string
  valueClass?: string
}

interface GridLevelData {
  level: number
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
  const total = entry.rows * entry.columns * entry.levels

  const levelsData: GridLevelData[] = Array.from({ length: entry.levels }, (_, levelIndex) => ({
    level: levelIndex + 1
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

// Exact occupied cells (only fetched for grid containers).
const { state: occupancyState } = useQueryColada(() => ({
  ...gridOccupancyQuery(props.slug),
  enabled: grid.value != null
}))
const cells = computed(() => occupancyState.value.status === 'success' ? occupancyState.value.data : [])

const dragPayload = ref<GridDragPayload | null>(null)
const dropTarget = ref<GridCoordinate | null>(null)
const isPlacementOpen = ref(false)

function onDrop(detail: GridDropDetail) {
  const target: GridCoordinate = { level: detail.level, row: detail.row, column: detail.column }
  const occupant = cells.value.find(cell => cellKey(cell) === cellKey(target))
  if (occupant) {
    if (occupant.slug !== detail.payload.slug) {
      showError(`Slot ${gridLabel(target.row, target.column, target.level)} is already occupied.`, 'Cannot move here')
    }
    return
  }
  dragPayload.value = detail.payload
  dropTarget.value = target
  isPlacementOpen.value = true
}

function onOpenCell(cell: { slug: string | null, type: 'container' | 'inventoryItem' }) {
  if (!cell.slug) return
  router.push(cell.type === 'container'
    ? `/inventory/containers/${cell.slug}/details`
    : `/inventory/items/${cell.slug}/details`)
}

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
        Container occupancy and capacity
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
        Hover a cell for its occupant. Drag an occupied cell onto a free slot to move it.
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
            :level="lvl.level"
            :parent-slug="slug"
            :cells="cells"
            mode="drag"
            @drop="onDrop"
            @open="onOpenCell"
          />
        </NTabsContent>
      </NTabs>

      <!-- Single level -->
      <InventoryCapacityGrid
        v-else
        :rows="grid.rows"
        :columns="grid.columns"
        :parent-slug="slug"
        :cells="cells"
        mode="drag"
        @drop="onDrop"
        @open="onOpenCell"
      />

      <InventoryGridDragGhost />
      <DialogGridPlacement
        v-model:open="isPlacementOpen"
        :payload="dragPayload"
        :parent-slug="slug"
        :position="dropTarget"
      />
    </div>
  </div>
</template>
