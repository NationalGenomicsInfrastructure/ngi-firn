<script setup lang="ts">
import type { AcceptanceCategoryOption } from '~/utils/inventory/containers'

const modelValue = defineModel<string[]>({ default: () => [] })

const props = defineProps<{
  options: AcceptanceCategoryOption[]
}>()

const toggleGroupItems = computed(() =>
  props.options.map(o => ({
    value: o.value,
    label: o.label,
    leading: o.icon
  }))
)
</script>

<template>
  <NToggleGroup
    v-model="modelValue"
    :items="toggleGroupItems"
    type="multiple"
    class="flex-wrap"
  />
</template>
