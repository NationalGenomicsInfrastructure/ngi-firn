<script setup lang="ts">
const route = useRoute()

const tabs = [
  { label: 'Details', to: 'details', icon: 'i-lucide-book-open-text' },
  { label: 'Contents', to: 'contents', icon: 'i-lucide-package-open' }
] as const

// Strip the current tab segment to get the base path for this slug
const basePath = computed(() => {
  const parts = route.path.split('/')
  const last = parts.at(-1)
  if (last === 'details' || last === 'contents') {
    parts.pop()
  }
  return parts.join('/')
})

const activeTab = computed(() => route.path.split('/').at(-1) ?? '')
</script>

<template>
  <div class="flex justify-center">
    <nav class="tabs-list">
      <NButton
        v-for="tab in tabs"
        :key="tab.to"
        :label="tab.label"
        :leading="tab.icon"
        :btn="activeTab === tab.to ? 'soft-black' : 'ghost-gray'"
        size="sm"
        :to="`${basePath}/${tab.to}`"
        class="tabs-trigger"
      />
    </nav>
  </div>
</template>
