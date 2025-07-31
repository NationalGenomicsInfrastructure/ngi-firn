<script setup lang="ts">
const props = defineProps<{
  section?: string
  subsection?: string
  paragraph?: string
}>()
</script>

<template>
  <h2
    v-if="props.section"
    class="scroll-m-20 font-semibold text-primary-700 dark:text-primary-400 tracking-tight text-2xl lg:text-3xl leading-snug mt-12 mb-4"
  >
    {{ props.section }}
  </h2>
  <h3
    v-if="props.subsection"
    class="scroll-m-20 font-medium text-primary-700 dark:text-primary-400 tracking-tight text-xl lg:text-2xl leading-normal mt-6 mb-4"
  >
    {{ props.subsection }}
  </h3>
  <h4
    v-if="props.paragraph"
    class="text-primary-600 dark:text-primary-400 leading-relaxed mt-4 mb-2"
  >
    {{ props.paragraph }}
  </h4>
</template>
