<script setup lang="ts">
import type { BarcodeScanWarning } from '~~/types/inventory'
import type { ScanBasketRole } from '~/composables/useScanBasket'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'
import { getContainerStatusMeta } from '~/utils/inventory/container'

/*
 * One scanned code in the basket, styled by the part it plays in the resolved plan:
 * a target that will change (and how), a target that is blocked (and why), the
 * location, an ignored location, or a code that could not be resolved at all.
 */

const props = defineProps<{
  code: string
  role: ScanBasketRole
  /* Warnings concerning this row's entity, e.g. a parent mismatch. */
  warnings: BarcodeScanWarning[]
}>()

const emit = defineEmits<{
  remove: [code: string]
}>()

const target = computed(() => props.role.kind === 'target' ? props.role.target : null)
const statusMeta = computed(() => target.value ? getContainerStatusMeta(target.value.status) : null)
const actionMeta = computed(() => target.value?.proposedAction ? getActionTypeMeta(target.value.proposedAction) : null)

const tone = computed(() => {
  switch (props.role.kind) {
    case 'target':
      return props.role.target.executable
        ? 'border-l-success-500 bg-success-50/40 dark:bg-success-900/10'
        : 'border-l-error-500 bg-error-50/40 dark:bg-error-900/10'
    case 'location':
      return 'border-l-primary-500 bg-primary-50/60 dark:bg-primary/10'
    case 'rejected':
      return 'border-l-error-300 opacity-80'
    default:
      return 'border-l-gray-300 dark:border-l-gray-700 opacity-80'
  }
})

const icon = computed(() => {
  if (props.role.kind === 'target') {
    return props.role.target.kind === 'item' ? 'i-lucide-test-tube' : 'i-lucide-package'
  }
  if (props.role.kind === 'location' || props.role.kind === 'ignored-location') return 'i-lucide-map-pin'
  if (props.role.kind === 'rejected') return 'i-lucide-circle-x'
  if (props.role.kind === 'unassigned') return 'i-lucide-circle-dashed'
  return 'i-lucide-loader-2'
})

const title = computed(() => target.value?.name ?? props.code)
</script>

<template>
  <li
    class="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-800 border-l-4 p-3"
    :class="tone"
  >
    <NIcon
      :name="icon"
      class="mt-1 text-xl shrink-0"
      :class="role.kind === 'pending' ? 'animate-spin text-muted' : 'text-primary-600 dark:text-primary-400'"
    />

    <div class="min-w-0 flex-1 space-y-1">
      <p class="font-semibold break-words">
        {{ title }}
      </p>
      <p
        v-if="target"
        class="font-mono text-xs text-muted break-all"
      >
        {{ code }}
      </p>

      <!-- Target: current status → proposed action -->
      <div
        v-if="target"
        class="flex flex-wrap items-center gap-1.5"
      >
        <NBadge
          v-if="statusMeta"
          :label="statusMeta.label"
          :icon="statusMeta.icon"
          :badge="statusMeta.badge"
        />
        <template v-if="actionMeta">
          <NIcon
            name="i-lucide-arrow-right"
            class="text-muted"
          />
          <NBadge
            :label="actionMeta.progressive"
            :icon="actionMeta.icon"
            :badge="target.executable ? actionMeta.badge : 'solid-gray'"
          />
        </template>
      </div>
      <p
        v-if="target && !target.executable && target.reason"
        class="text-sm text-error-700 dark:text-error-300"
      >
        {{ target.reason }}
      </p>
      <p
        v-for="(warning, index) in warnings"
        :key="index"
        class="flex gap-1.5 text-sm text-yellow-700 dark:text-yellow-300"
      >
        <NIcon
          name="i-lucide-triangle-alert"
          class="mt-0.5 shrink-0"
        />
        {{ warning.message }}
      </p>

      <p
        v-if="role.kind === 'location'"
        class="text-sm font-medium text-primary-700 dark:text-primary-300"
      >
        {{ role.relocating ? 'Destination' : 'Location (not changed)' }}
      </p>
      <p
        v-else-if="role.kind === 'ignored-location'"
        class="text-sm text-muted"
      >
        Location not used for this action.
      </p>
      <p
        v-else-if="role.kind === 'rejected'"
        class="text-sm text-error-700 dark:text-error-300"
      >
        {{ role.rejection.message }}
      </p>
      <p
        v-else-if="role.kind === 'unassigned'"
        class="text-sm text-muted"
      >
        {{ role.message }}
      </p>
      <p
        v-else-if="role.kind === 'pending'"
        class="text-sm text-muted"
      >
        Resolving…
      </p>
    </div>

    <NButton
      btn="ghost-gray hover:soft-error"
      label="i-lucide-x"
      icon
      size="lg"
      class="shrink-0"
      :aria-label="`Remove ${title} from the basket`"
      @mousedown.prevent
      @click="emit('remove', code)"
    />
  </li>
</template>
