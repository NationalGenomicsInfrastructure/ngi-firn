<script setup lang="ts">
/* Small uppercase caption used for filter groups and form fields inside `FilterBar`. */
defineProps<{
  for?: string
}>()
</script>

<template>
  <label
    :for="$props.for"
    :class="UI_LABEL_STYLE"
  >
    <slot />
  </label>
</template>
