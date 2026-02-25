<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    flex="~ col"
    class="text-center space-y-1 lg:text-left lg:space-y-2 mb-8 mt-4"
  >
    <h1 class="scroll-m-20 text-center font-display font-semibold tracking-tight text-display text-4xl lg:text-5xl">
      {{ props.title }}
    </h1>
    <p
      v-if="props.description"
      class="text-center text-muted text-md md:text-lg"
    >
      {{ props.description }}
    </p>
  </div>
</template>
