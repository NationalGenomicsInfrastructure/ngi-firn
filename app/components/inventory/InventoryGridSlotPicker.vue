<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { GridPosition } from '~~/types/inventory'
import { containerBySlugQuery, gridOccupancyQuery } from '~/utils/queries/inventory/containers'
import { gridLabel, type GridCoordinate } from '~/utils/inventory/grid'

/*
 * Lets the user choose a free cell of a grid container for a NEW child (Add container / Add item).
 * Renders nothing unless the parent is a grid container whose single grid entry accepts `childKind`.
 * Leaving the selection empty keeps the server default (first free slot).
 */
const props = defineProps<{
  parentSlug: string
  parentKind: 'container' | 'equipment'
  childKind: 'container' | 'item'
}>()

/* Chosen position, or null for "first free slot". */
const position = defineModel<GridPosition | null>({ default: null })

const { state: parentState } = useQueryColada(() => ({
  ...containerBySlugQuery(props.parentSlug),
  enabled: props.parentKind === 'container'
}))

const gridEntry = computed(() => {
  if (props.parentKind !== 'container' || parentState.value.status !== 'success') return null
  const entry = parentState.value.data?.capacity?.find(e => e.layout === 'grid')
  return entry?.layout === 'grid' && entry.childKind === props.childKind ? entry : null
})

const { state: occupancyState } = useQueryColada(() => ({
  ...gridOccupancyQuery(props.parentSlug),
  enabled: gridEntry.value != null
}))
const cells = computed(() => occupancyState.value.status === 'success' ? occupancyState.value.data : [])

const selected = computed<GridCoordinate[]>({
  get: () => position.value
    ? [{ level: position.value.level ?? 1, row: position.value.row, column: position.value.column }]
    : [],
  set: (value) => {
    const [first] = value
    position.value = first
      ? { ...first, label: gridLabel(first.row, first.column, first.level) }
      : null
  }
})

const levels = computed(() => Array.from({ length: gridEntry.value?.levels ?? 1 }, (_, i) => i + 1))
</script>

<template>
  <div
    v-if="gridEntry"
    class="space-y-2"
  >
    <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
      Position in {{ parentSlug }}
    </p>
    <p class="text-sm text-muted">
      <template v-if="position">
        Selected slot <span class="font-semibold text-success">{{ position.label }}</span>.
        <NButton
          label="Clear"
          size="xs"
          btn="link-gray"
          type="button"
          @click="position = null"
        />
      </template>
      <template v-else>
        Click a free slot, or leave empty to use the first free slot.
      </template>
    </p>

    <NTabs
      v-if="levels.length > 1"
      default-value="level-1"
    >
      <NTabsList>
        <NTabsTrigger
          v-for="level in levels"
          :key="level"
          :value="`level-${level}`"
        >
          Level {{ level }}
        </NTabsTrigger>
      </NTabsList>
      <NTabsContent
        v-for="level in levels"
        :key="level"
        :value="`level-${level}`"
        class="mt-3"
      >
        <InventoryCapacityGrid
          v-model:selected="selected"
          :rows="gridEntry.rows"
          :columns="gridEntry.columns"
          :level="level"
          :parent-slug="parentSlug"
          :cells="cells"
          mode="select"
        />
      </NTabsContent>
    </NTabs>
    <InventoryCapacityGrid
      v-else
      v-model:selected="selected"
      :rows="gridEntry.rows"
      :columns="gridEntry.columns"
      :parent-slug="parentSlug"
      :cells="cells"
      mode="select"
    />
  </div>
</template>
