<script setup lang="ts" generic="T extends string">
import type { TaskOption } from '~/utils/tasks/options'

/*
 * Radio group rendered as selectable cards with an icon, a label and a smaller grey explanation.
 * Generic building block of the task importance and visibility fields.
 */
const props = defineProps<{
  modelValue: T | undefined
  options: TaskOption<T>[]
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

// Full class strings so the CSS generator can see them.
const SELECTED_STYLE = {
  primary: 'border-primary bg-primary/10 text-primary',
  gray: 'border-gray-400 bg-gray-500/10'
} as const

const IDLE_STYLE = 'border-muted hover:border-gray-400'

function select(value: T) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel"
    class="grid grid-cols-1 sm:grid-cols-2 gap-2"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      class="flex items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="option.value === modelValue ? SELECTED_STYLE[option.tone] : IDLE_STYLE"
      @click="select(option.value)"
    >
      <NIcon
        :name="option.icon"
        class="mt-0.5 h-5 w-5 shrink-0"
      />
      <span class="min-w-0">
        <span class="block text-sm font-medium">{{ option.label }}</span>
        <span class="block text-xs text-muted">{{ option.description }}</span>
      </span>
    </button>
  </div>
</template>
