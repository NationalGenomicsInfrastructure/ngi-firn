<script setup lang="ts">
import type { TaskImportance } from '~~/schemas/tasks/enums'
import { TASK_IMPORTANCE_OPTIONS } from '~/utils/tasks/options'

defineProps<{
  modelValue: TaskImportance | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TaskImportance]
}>()
</script>

<template>
  <FormFieldOptionCards
    :model-value="modelValue"
    :options="TASK_IMPORTANCE_OPTIONS"
    aria-label="Importance"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
