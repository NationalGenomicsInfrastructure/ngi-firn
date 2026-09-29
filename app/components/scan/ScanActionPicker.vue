<script setup lang="ts">
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { BARCODE_ACTION_MNEMONICS } from '~~/schemas/inventory/barcode'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'

/*
 * Large action selector for the scan basket.
 *
 * Offers the same operations as the printed action cards, so a tablet user can tap
 * instead of hunting for the card sheet. Scanning a card and tapping a button drive
 * the same single selection. "Check out / return" is the card-less default toggle.
 *
 * Buttons never take focus (pointerdown is prevented): a keyboard-wedge scanner ends
 * each code with Enter, which would otherwise re-click whichever button was tapped last.
 */

defineProps<{
  modelValue: InventoryActionType | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: InventoryActionType | null]
}>()

const options = computed(() => [
  { value: null, label: 'Check out / return', icon: 'i-lucide-arrow-left-right' },
  ...(Object.keys(BARCODE_ACTION_MNEMONICS) as InventoryActionType[]).map((action) => {
    const meta = getActionTypeMeta(action)
    return { value: action, label: meta.progressive, icon: meta.icon }
  })
])
</script>

<template>
  <div class="space-y-2">
    <div
      class="grid grid-cols-2 sm:grid-cols-4 gap-2"
      role="radiogroup"
      aria-label="Action to apply"
    >
      <NButton
        v-for="option in options"
        :key="option.value ?? 'toggle'"
        role="radio"
        :aria-checked="modelValue === option.value"
        :btn="modelValue === option.value ? 'solid-primary' : 'soft-gray hover:outline-primary'"
        size="lg"
        :leading="option.icon"
        :label="option.label"
        class="min-h-14 justify-start whitespace-normal text-left"
        :class="option.value === null ? 'col-span-2 sm:col-span-4' : ''"
        @pointerdown.prevent
        @click="emit('update:modelValue', option.value)"
      />
    </div>
    <p
      v-if="modelValue === 'move' || modelValue === 'locate'"
      class="flex items-center gap-2 text-sm text-primary-700 dark:text-primary-300"
    >
      <NIcon name="i-lucide-map-pin" />
      Scan the entities first and the destination last.
    </p>
  </div>
</template>
