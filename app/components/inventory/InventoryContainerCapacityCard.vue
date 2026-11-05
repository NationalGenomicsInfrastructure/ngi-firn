<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { ContainerCapacityEntry } from '~~/schemas/inventory/container'
import type { AcceptedChildCapacity } from '~~/types/inventory'
import type { GridDragPayload, GridDropDetail } from '~/composables/useGridDrag'
import { getChildTypeMeta } from '~/utils/inventory/item'
import { containerCapacitySummaryQuery, gridOccupancyQuery } from '~/utils/queries/inventory/containers'
import { cellKey, gridLabel, type GridCoordinate } from '~/utils/inventory/grid'

/*
 * Single capacity card for a container:
 *  - count layout: one tile per accepted child type (stored / capacity + bar).
 *  - grid layout:  occupancy ring on the left, interactive grid (drag to move) on the right.
 * A grid holds exactly one content type, so the grid itself is not colour-coded per type.
 */
const props = defineProps<{
  slug: string
  capacity: ContainerCapacityEntry[] | null
}>()

const { showError } = useFirnToast()
const router = useRouter()

const gridEntry = computed(() => {
  const entry = props.capacity?.find(e => e.layout === 'grid')
  return entry && entry.layout === 'grid' ? entry : null
})

const isGrid = computed(() => gridEntry.value != null)

// ---- status helpers -------------------------------------------------------

type Status = 'ok' | 'warning' | 'full'

function statusOf(stored: number, total: number): Status {
  if (total > 0 && stored >= total) return 'full'
  if (total > 0 && stored / total >= 0.8) return 'warning'
  return 'ok'
}

const STATUS_PROGRESS: Record<Status, string> = { ok: 'success', warning: 'yellow', full: 'error' }
const STATUS_TEXT: Record<Status, string> = {
  ok: 'text-success-500',
  warning: 'text-yellow-500',
  full: 'text-error-500'
}
const STATUS_LABEL: Record<Status, string | null> = { ok: null, warning: 'Nearly full', full: 'Full' }
const STATUS_BADGE: Record<Status, string> = { ok: 'soft-gray', warning: 'soft-warning', full: 'soft-error' }

// ---- count layout ---------------------------------------------------------

const { state: summaryState, asyncStatus: summaryStatus } = useQueryColada(() => ({
  ...containerCapacitySummaryQuery(props.slug),
  enabled: !isGrid.value
}))

const tiles = computed(() => {
  const entries: AcceptedChildCapacity[] = summaryState.value.status === 'success' ? summaryState.value.data : []
  return entries
    .map((entry) => {
      const meta = getChildTypeMeta(entry.childKind, entry.type)
      const status = statusOf(entry.stored, entry.total)
      return {
        key: `${entry.childKind}-${entry.type}`,
        label: meta.label,
        icon: meta.icon,
        stored: entry.stored,
        total: entry.total,
        free: Math.max(entry.total - entry.stored, 0),
        status,
        progress: entry.total === 0 ? 'gray' : STATUS_PROGRESS[status]
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
})

// ---- grid layout ----------------------------------------------------------

const grid = computed(() => {
  const entry = gridEntry.value
  if (!entry) return null
  const meta = getChildTypeMeta(entry.childKind, entry.type)
  const total = entry.rows * entry.columns * entry.levels
  const percent = total > 0 ? Math.round((entry.stored / total) * 100) : 0
  return {
    label: meta.label,
    icon: meta.icon,
    rows: entry.rows,
    columns: entry.columns,
    levels: entry.levels,
    stored: entry.stored,
    total,
    free: Math.max(total - entry.stored, 0),
    percent,
    status: statusOf(entry.stored, total)
  }
})

const RING_RADIUS = 40
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringDash = computed(() => {
  const g = grid.value
  const filled = g && g.total > 0 ? (g.stored / g.total) * RING_CIRCUMFERENCE : 0
  return `${filled} ${RING_CIRCUMFERENCE}`
})

const { state: occupancyState } = useQueryColada(() => ({
  ...gridOccupancyQuery(props.slug),
  enabled: isGrid.value
}))
const cells = computed(() => occupancyState.value.status === 'success' ? occupancyState.value.data : [])

const levelTabs = computed(() => {
  const g = grid.value
  if (!g) return []
  const perLevel = g.rows * g.columns
  return Array.from({ length: g.levels }, (_, i) => ({
    level: i + 1,
    stored: cells.value.filter(cell => cell.level === i + 1).length,
    total: perLevel
  }))
})

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
  <section
    v-if="!isEmpty"
    class="overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 border-t-6 border-t-primary-100 dark:border-t-primary-900"
  >
    <!-- Header -->
    <header class="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center gap-3">
        <NIcon
          name="i-lucide-package-open"
          class="text-primary-500 text-xl"
        />
        <div>
          <h4 class="text-base font-semibold leading-tight">
            Occupancy and capacity
          </h4>
          <p class="text-sm text-muted mt-0.5">
            <template v-if="grid">
              {{ grid.levels > 1 ? `${grid.rows} × ${grid.columns} × ${grid.levels}` : `${grid.rows} × ${grid.columns}` }}
              · {{ grid.total }} positions · {{ grid.label }}
            </template>
            <template v-else>
              Capacity per type
            </template>
          </p>
        </div>
      </div>
    </header>

    <!-- Count layout -->
    <div
      v-if="!grid"
      class="p-6"
    >
      <p
        v-if="summaryStatus === 'loading'"
        class="text-sm text-muted"
      >
        Loading capacity…
      </p>
      <p
        v-else-if="tiles.length === 0"
        class="text-sm text-muted"
      >
        No capacity configured.
      </p>
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <NIcon
                :name="tile.icon"
                class="text-primary-500 shrink-0"
              />
              <span class="text-sm font-medium truncate">{{ tile.label }}</span>
            </div>
            <NBadge
              v-if="STATUS_LABEL[tile.status]"
              :label="STATUS_LABEL[tile.status]!"
              :badge="STATUS_BADGE[tile.status]"
              size="xs"
            />
          </div>
          <div class="text-2xl font-bold tabular-nums">
            {{ tile.stored }}<span class="text-base font-medium text-muted"> / {{ tile.total }}</span>
          </div>
          <NProgress
            :model-value="tile.stored"
            :max="Math.max(tile.total, 1)"
            :progress="tile.progress"
            size="sm"
          />
          <p class="text-xs text-muted">
            {{ tile.total === 0 ? 'Not accepted here' : tile.free === 0 ? 'No free space' : `${tile.free} free` }}
          </p>
        </div>
      </div>
    </div>

    <!-- Grid layout -->
    <div
      v-else
      class="flex flex-wrap"
    >
      <!-- Summary -->
      <div class="flex-1 basis-80 min-w-0 p-6 border-r border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-5">
          <div class="relative size-24 shrink-0">
            <svg
              viewBox="0 0 96 96"
              class="size-full"
              role="img"
              :aria-label="`${grid.stored} of ${grid.total} positions occupied`"
            >
              <circle
                cx="48"
                cy="48"
                :r="RING_RADIUS"
                fill="none"
                stroke="currentColor"
                stroke-width="10"
                class="text-gray-200 dark:text-gray-800"
              />
              <circle
                cx="48"
                cy="48"
                :r="RING_RADIUS"
                fill="none"
                stroke="currentColor"
                stroke-width="10"
                stroke-linecap="round"
                :stroke-dasharray="ringDash"
                transform="rotate(-90 48 48)"
                :class="STATUS_TEXT[grid.status]"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-xl font-bold leading-none tabular-nums">{{ grid.percent }}%</span>
              <span class="text-[11px] text-muted mt-0.5">full</span>
            </div>
          </div>
          <div class="space-y-1">
            <div class="text-3xl font-bold leading-tight tabular-nums">
              {{ grid.stored }}<span class="text-lg font-medium text-muted"> / {{ grid.total }}</span>
            </div>
            <p class="text-xs text-muted">
              positions occupied
            </p>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ grid.free }} free</span>
              <NBadge
                v-if="STATUS_LABEL[grid.status]"
                :label="STATUS_LABEL[grid.status]!"
                :badge="STATUS_BADGE[grid.status]"
                size="xs"
              />
            </div>
          </div>
        </div>

        <div class="mt-6 pt-5 border-t border-gray-200 dark:border-gray-800">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            Content
          </p>
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 min-w-0">
              <NIcon
                :name="grid.icon"
                class="text-primary-500 shrink-0"
              />
              <span class="text-sm font-medium truncate">{{ grid.label }}</span>
            </div>
            <span class="text-sm font-semibold tabular-nums">
              {{ grid.stored }}<span class="font-normal text-muted"> / {{ grid.total }}</span>
            </span>
          </div>
          <NProgress
            :model-value="grid.stored"
            :max="Math.max(grid.total, 1)"
            :progress="STATUS_PROGRESS[grid.status]"
            size="sm"
          />
        </div>
      </div>

      <!-- Grid -->
      <div class="flex-[1.4] basis-96 min-w-0 space-y-4 p-6 bg-gray-50 dark:bg-gray-950/40">
        <p class="text-xs text-muted">
          Hover a cell for its occupant. Drag an occupied cell onto a free slot to move it.
        </p>

        <NTabs
          v-if="grid.levels > 1"
          default-value="level-1"
        >
          <NTabsList>
            <NTabsTrigger
              v-for="tab in levelTabs"
              :key="`trigger-${tab.level}`"
              :value="`level-${tab.level}`"
            >
              Level {{ tab.level }}
              <span class="ml-1 text-xs text-muted tabular-nums">{{ tab.stored }}/{{ tab.total }}</span>
            </NTabsTrigger>
          </NTabsList>
          <NTabsContent
            v-for="tab in levelTabs"
            :key="`content-${tab.level}`"
            :value="`level-${tab.level}`"
            class="mt-3"
          >
            <InventoryCapacityGrid
              :rows="grid.rows"
              :columns="grid.columns"
              :level="tab.level"
              :parent-slug="slug"
              :cells="cells"
              mode="drag"
              size="lg"
              @drop="onDrop"
              @open="onOpenCell"
            />
          </NTabsContent>
        </NTabs>

        <InventoryCapacityGrid
          v-else
          :rows="grid.rows"
          :columns="grid.columns"
          :parent-slug="slug"
          :cells="cells"
          mode="drag"
          size="lg"
          @drop="onDrop"
          @open="onOpenCell"
        />

        <div class="flex items-center gap-4 pt-4 text-xs text-muted border-t border-gray-200 dark:border-gray-800">
          <span class="flex items-center gap-1.5">
            <span class="size-3 rounded-sm border border-primary-600 bg-primary-500 dark:bg-primary-600" />
            Occupied
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-3 rounded-sm border border-primary-200 dark:border-primary-800" />
            Free
          </span>
        </div>

        <InventoryGridDragGhost />
        <DialogGridPlacement
          v-model:open="isPlacementOpen"
          :payload="dragPayload"
          :parent-slug="slug"
          :position="dropTarget"
        />
      </div>
    </div>
  </section>
</template>
