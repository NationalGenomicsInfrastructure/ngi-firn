<script setup lang="ts">
import type { AcceptanceCategoryOption } from '~/utils/inventory/containers'

const modelValue = defineModel<string[]>({ default: () => [] })

defineProps<{
  options: AcceptanceCategoryOption[]
}>()

function isSelected(value: string) {
  return modelValue.value.includes(value)
}

function toggle(value: string) {
  modelValue.value = isSelected(value)
    ? modelValue.value.filter(v => v !== value)
    : [...modelValue.value, value]
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <NButton
      v-for="option in options"
      :key="option.value"
      type="button"
      size="sm"
      :leading="option.icon"
      :label="option.label"
      :btn="isSelected(option.value) ? 'solid-primary' : 'soft-gray hover:soft-primary'"
      :aria-pressed="isSelected(option.value)"
      @click="toggle(option.value)"
    />
  </div>
</template>
