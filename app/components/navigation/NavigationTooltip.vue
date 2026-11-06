<script setup lang="ts">
// Content-only component: NSidebarMenuButton already provides the tooltip
// root, trigger and positioning. Pass it via `:tooltip="h(NavigationTooltip, {...})"`.
defineProps<{
  title?: string | null
  tooltip?: string
  icon?: string
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <NIcon
      v-if="icon"
      :name="icon"
      class="shrink-0"
    />
    <div class="flex flex-col">
      <span
        v-if="title"
        class="text-sm font-medium"
      >{{ title }}</span>
      <span
        v-if="tooltip"
        class="text-xs opacity-70"
      >{{ tooltip }}</span>
    </div>
  </div>
</template>
