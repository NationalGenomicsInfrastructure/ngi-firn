<script setup lang="ts">
import { SEARCH_HIGHLIGHT_POST, SEARCH_HIGHLIGHT_PRE } from '~~/schemas/projects'

/*
 * Renders a catalog-search snippet whose matched terms are wrapped in control-character markers.
 * Segments are rendered as text nodes (never as HTML), so indexed content can't inject markup.
 */
const props = defineProps<{
  text: string
}>()

const segments = computed(() => {
  const result: Array<{ text: string, match: boolean }> = []
  for (const part of props.text.split(SEARCH_HIGHLIGHT_PRE)) {
    const end = part.indexOf(SEARCH_HIGHLIGHT_POST)
    if (end < 0) {
      if (part) result.push({ text: part, match: false })
      continue
    }
    result.push({ text: part.slice(0, end), match: true })
    const rest = part.slice(end + 1)
    if (rest) result.push({ text: rest, match: false })
  }
  return result
})
</script>

<template>
  <span>
    <template
      v-for="(segment, index) in segments"
      :key="index"
    >
      <mark
        v-if="segment.match"
        class="rounded-sm bg-primary-100 px-0.5 text-inherit dark:bg-primary-900"
      >{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>
