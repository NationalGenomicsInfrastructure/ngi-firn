<script setup lang="ts">
import type { TaskVisibility } from '~~/schemas/tasks/enums'
import { TASK_VISIBILITY_OPTIONS } from '~/utils/tasks/options'

defineProps<{
  modelValue: TaskVisibility | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TaskVisibility]
}>()
</script>

<template>
  <FormFieldOptionCards
    :model-value="modelValue"
    :options="TASK_VISIBILITY_OPTIONS"
    aria-label="Visibility"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
