<script setup lang="ts">
import type { EquipmentCapacityEntry } from '~~/schemas/inventory/equipment'
import {
  CONTAINER_TYPE_LABELS,
  CONTAINER_TYPE_ICONS,
  resolveContainerTypeFromSelect
} from '~/utils/inventory/equipment'

const props = defineProps<{
  capacity: EquipmentCapacityEntry[] | null
}>()

interface CapacityBarRow {
  key: string
  label: string
  icon: string
  stored: number
  total: number
  percent: number
  progress: string
  valueClass?: string
}

const rows = computed<CapacityBarRow[]>(() => {
  const entries = props.capacity ?? []

  return entries
    .map((entry): CapacityBarRow | null => {
      const type = resolveContainerTypeFromSelect(entry.type)
      if (!type) {
        return null
      }

      const total = entry.capacity
      const stored = entry.stored
      const percent = total > 0 ? (stored / total) * 100 : 0

      let progress = 'success'
      if (total === 0) progress = 'gray'
      else if (stored >= total) progress = 'error'
      else if (percent >= 80) progress = 'yellow'

      return {
        key: type,
        label: CONTAINER_TYPE_LABELS[type],
        icon: CONTAINER_TYPE_ICONS[type],
        stored,
        total,
        percent,
        progress,
        valueClass: total === 0 ? 'text-muted' : undefined
      }
    })
    .filter((row): row is CapacityBarRow => row !== null)
    .sort((a, b) => a.label.localeCompare(b.label))
})

const isEmpty = computed(() => rows.value.length === 0)
</script>

<template>
  <div class="space-y-3 mt-3">
    <p
      v-if="isEmpty"
      class="text-sm text-muted"
    >
      No capacity configured.
    </p>

    <div
      v-else
      class="space-y-4"
    >
      <div
        v-for="row in rows"
        :key="row.key"
        class="space-y-1"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <NIcon
              :name="row.icon"
              class="text-primary-400 dark:text-primary-600 text-xs shrink-0"
            />
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium truncate">
              {{ row.label }}
            </span>
          </div>
          <span
            class="text-sm font-medium tabular-nums shrink-0"
            :class="row.valueClass"
          >
            {{ row.stored }} / {{ row.total }}
          </span>
        </div>
        <NProgress
          :model-value="row.stored"
          :max="Math.max(row.total, 1)"
          :progress="row.progress"
          size="sm"
        />
      </div>
    </div>
  </div>
</template>
