<script setup lang="ts">
import type { InventoryActionChangeRecord } from '~~/types/inventory'
import { formatChangeValue, prettifyFieldName } from '~/utils/inventory/actionLog'

const props = defineProps<{
  change: InventoryActionChangeRecord
}>()

const before = computed(() => formatChangeValue(props.change.before))
const after = computed(() => formatChangeValue(props.change.after))
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1.5">
      <NIcon
        name="i-lucide-pencil-ruler"
        class="text-primary-400 dark:text-primary-600 text-xs"
      />
      <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
        {{ prettifyFieldName(change.field) }}
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-2 pl-5">
      <NBadge
        badge="soft-error"
        :label="before"
        class="line-through decoration-1"
      />
      <NIcon
        name="i-lucide-arrow-right"
        class="text-muted text-xs shrink-0"
      />
      <NBadge
        badge="soft-success"
        :label="after"
      />
    </div>
  </div>
</template>
