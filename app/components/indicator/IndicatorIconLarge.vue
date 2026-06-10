<script setup lang="ts">
defineProps<{
  icon: string
  label: string
  value: number | string
}>()
</script>

<template>
  <div class="p-4 rounded-md bg-muted/30">
    <div class="flex items-center gap-2 mb-2">
      <NIcon
        :name="icon"
        class="text-muted"
      />
      <h4 class="text-sm font-semibold">
        {{ label }}
      </h4>
    </div>
    <p class="text-2xl font-bold">
      {{ value }}
    </p>
  </div>
</template>
