<script setup lang="ts">
defineProps<{
  icon: string
  label: string
  value?: string | number
  valueClass?: string
}>()
</script>

<template>
  <div>
    <div class="flex items-center gap-1.5 mb-0.5">
      <NIcon
        :name="icon"
        class="text-primary-400 dark:text-primary-600 text-xs"
      />
      <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
        {{ label }}
      </span>
    </div>
    <p
      class="font-medium pl-5"
      :class="valueClass"
    >
      <slot>{{ value }}</slot>
    </p>
  </div>
</template>
