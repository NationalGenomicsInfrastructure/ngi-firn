<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { AcceptedChildCapacity } from '~~/types/inventory'
import { containerCapacitySummaryQuery } from '~/utils/queries/inventory/containers'
import { getChildTypeMeta } from '~/utils/inventory/item'

const props = defineProps<{
  slug: string
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

const { state, asyncStatus } = useQueryColada(
  () => containerCapacitySummaryQuery(props.slug)
)

const isLoading = computed(() => asyncStatus.value === 'loading')
const isError = computed(() => state.value.status === 'error')

const rows = computed<CapacityBarRow[]>(() => {
  const entries: AcceptedChildCapacity[] = state.value.status === 'success' ? state.value.data : []

  return entries
    .map((entry) => {
      const meta = getChildTypeMeta(entry.childKind, entry.type)
      const percent = entry.total > 0 ? (entry.stored / entry.total) * 100 : 0

      let progress = 'success'
      if (entry.total === 0) progress = 'gray'
      else if (entry.stored >= entry.total) progress = 'error'
      else if (percent >= 80) progress = 'yellow'

      return {
        key: `${entry.childKind}-${entry.type}`,
        label: meta.label,
        icon: meta.icon,
        stored: entry.stored,
        total: entry.total,
        percent,
        progress,
        valueClass: entry.total === 0 ? 'text-muted' : undefined
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
})

const isEmpty = computed(() => rows.value.length === 0)
</script>

<template>
  <div class="space-y-3 mt-3">
    <p
      v-if="isLoading"
      class="text-sm text-muted"
    >
      Loading capacity…
    </p>

    <p
      v-else-if="isError"
      class="text-sm text-error"
    >
      Could not load capacity.
    </p>

    <p
      v-else-if="isEmpty"
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
