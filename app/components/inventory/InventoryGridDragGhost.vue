<script setup lang="ts">
import { useGridDrag } from '~/composables/useGridDrag'

/* Floating label that follows the pointer while a grid drag is in progress. Render once per page. */
const { payload, pointer, isDragging } = useGridDrag()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isDragging && payload"
      class="fixed z-[9999] pointer-events-none px-2 py-1 rounded-md text-xs font-medium bg-primary-600 text-white shadow-lg"
      :style="{ left: `${pointer.x + 12}px`, top: `${pointer.y + 12}px` }"
    >
      {{ payload.label }}
    </div>
  </Teleport>
</template>
