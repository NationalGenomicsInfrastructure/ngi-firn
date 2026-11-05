<script setup lang="ts">
import type { SearchIndexStatus } from '~~/types/search'

const props = defineProps<{
  freshness: SearchIndexStatus | undefined
}>()

/*
 * Surface the search index state explicitly so users can tell "no matches" apart from "the engine
 * is still building / unavailable". Only renders when attention is warranted — a healthy, fully
 * ready index shows nothing.
 */
const banner = computed(() => {
  const freshness = props.freshness
  if (!freshness) {
    return null
  }
  switch (freshness.phase) {
    case 'unavailable':
      return { icon: 'i-lucide-cloud-off', card: 'border-error', text: freshness.message ?? 'Search is currently unavailable.' }
    case 'initializing':
      return { icon: 'i-lucide-loader', card: 'border-amber', text: 'The search index is still being built. Results may be incomplete.' }
    case 'stale':
      return { icon: 'i-lucide-clock-alert', card: 'border-emerald', text: freshness.message ?? 'Search results may be slightly out of date.' }
    default:
      return freshness.projectsConfigured
        ? null
        : { icon: 'i-lucide-info', card: 'border-gray', text: 'Project links are not available; only direct inventory matches are shown.' }
  }
})
</script>

<template>
  <NAlert
    v-if="banner"
    :alert="banner.card"
    class="mb-4"
    title="Search Status"
    :description="banner.text"
    :icon="banner.icon"
  />
</template>
