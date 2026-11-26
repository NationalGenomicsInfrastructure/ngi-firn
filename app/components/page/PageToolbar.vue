<script setup lang="ts">
/*
 * Actions on the thing a page shows, placed under the page title across the full content width.
 * The default slot holds the everyday actions; `#end` is pushed to the right and is meant for the
 * ones that close or remove something. Render it only when there is at least one action.
 */
defineProps<{
  /* Accessible name, e.g. "Task actions". */
  label: string
}>()
</script>

<template>
  <div
    role="toolbar"
    :aria-label="label"
    class="flex flex-wrap items-center gap-2 rounded-md border border-base bg-base p-3 shadow-sm"
  >
    <slot />
    <div
      v-if="$slots.end"
      class="ml-auto flex flex-wrap items-center justify-end gap-2"
    >
      <slot name="end" />
    </div>
  </div>
</template>
