<script setup lang="ts">
import type { BarcodeScanPlan } from '~~/types/inventory'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

/*
 * One-line answer to "what will Approve do?", plus anything that blocks or qualifies it.
 */

const props = defineProps<{
  action: InventoryActionType | null
  plan: BarcodeScanPlan | null
  executableCount: number
  relocating: boolean
}>()

const headline = computed(() => {
  const count = props.executableCount
  const noun = count === 1 ? 'entity' : 'entities'
  if (!props.action) return `Check out or return ${count} ${noun}`
  return `${getActionTypeMeta(props.action).progressive} ${count} ${noun}`
})

const icon = computed(() => props.action ? getActionTypeMeta(props.action).icon : 'i-lucide-arrow-left-right')

const showWarnings = ref(false)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-3 rounded-lg bg-primary-50 dark:bg-primary/10 p-4">
      <NIcon
        :name="icon"
        class="text-2xl text-primary shrink-0"
      />
      <div class="min-w-0">
        <p class="text-lg font-semibold">
          {{ headline }}
        </p>
        <p
          v-if="plan?.context"
          class="text-sm text-muted break-words"
        >
          <template v-if="relocating">
            Destination: <span class="font-medium text-primary-700 dark:text-primary-300">{{ plan.context.name }}</span>
          </template>
          <template v-else>
            At: <span class="font-medium">{{ plan.context.name }}</span>
          </template>
        </p>
        <p
          v-else-if="relocating"
          class="text-sm text-muted"
        >
          No destination scanned yet.
        </p>
      </div>
    </div>

    <NAlert
      v-if="plan?.error"
      alert="soft-error"
      title="Cannot apply this basket"
      :description="plan.error"
      icon="i-lucide-octagon-alert"
    />

    <div v-if="plan?.warnings.length">
      <NButton
        btn="ghost-yellow"
        size="sm"
        :leading="showWarnings ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        :label="`${plan.warnings.length} warning${plan.warnings.length === 1 ? '' : 's'}`"
        @mousedown.prevent
        @click="showWarnings = !showWarnings"
      />
      <ul
        v-if="showWarnings"
        class="mt-1 space-y-1 pl-2 text-sm"
      >
        <li
          v-for="(warning, index) in plan.warnings"
          :key="index"
          class="flex gap-2"
        >
          <NIcon
            name="i-lucide-triangle-alert"
            class="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400"
          />
          {{ warning.message }}
        </li>
      </ul>
    </div>
  </div>
</template>
