<script setup lang="ts">
import {
  CONTAINER_TYPE_OPTIONS,
  CONTAINER_TYPE_LABELS,
  resolveContainerTypeFromSelect,
  type CapacityRow
} from '~/utils/inventory/equipment'
import type { ContainerType } from '~~/schemas/inventory/container'

const props = defineProps<{
  capacity: CapacityRow[] | null
}>()

interface CapacityDisplayRow {
  type: ContainerType
  label: string
  icon: string
  value: string
  valueClass?: string
}

const CONTAINER_TYPE_ICONS: Record<ContainerType, string> = {
  rack: 'i-lucide-table',
  box: 'i-lucide-package',
  bag: 'i-lucide-paper-bag',
  tray: 'i-lucide-square-library',
  other: 'i-lucide-proportions'
}

const capacityRows = computed<CapacityDisplayRow[]>(() => {
  if (!props.capacity || props.capacity.length === 0) {
    return []
  }

  const byType = new Map<ContainerType, { capacity: number, stored?: number }>()

  for (const rawRow of props.capacity) {
    const type = resolveContainerTypeFromSelect(rawRow.type)
    if (!type) {
      continue
    }

    const maybeStored = (rawRow as CapacityRow & { stored?: unknown }).stored
    const stored = typeof maybeStored === 'number' && Number.isFinite(maybeStored) ? maybeStored : undefined

    byType.set(type, { capacity: rawRow.capacity, stored })
  }

  return [...CONTAINER_TYPE_OPTIONS]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(option => option.value)
    .filter(type => byType.has(type))
    .map((type) => {
      const row = byType.get(type)
      const capacity = row?.capacity ?? 0
      const stored = row?.stored
      const value = stored == null ? `${capacity}` : `${stored} / ${capacity}`

      return {
        type,
        label: CONTAINER_TYPE_LABELS[type],
        icon: CONTAINER_TYPE_ICONS[type],
        value,
        valueClass: capacity === 0 ? 'text-muted' : undefined
      }
    })
})
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

    <div
      v-if="capacityRows.length > 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm"
    >
      <IndicatorIconCard
        v-for="row in capacityRows"
        :key="row.type"
        :icon="row.icon"
        :label="row.label"
        :value="row.value"
        :value-class="row.valueClass"
      />
    </div>

    <p
      v-else
      class="text-sm text-muted"
    >
      No container type limits configured.
    </p>
  </div>
</template>
