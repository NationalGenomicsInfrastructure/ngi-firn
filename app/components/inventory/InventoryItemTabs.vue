<script setup lang="ts">
const route = useRoute()

const tabs = [
  { label: 'Details', to: 'details', icon: 'i-lucide-book-open-text' },
  { label: 'Action log', to: 'log', icon: 'i-lucide-clipboard-clock' }
] as const

const basePath = computed(() => {
  const parts = route.path.split('/')
  if (parts.at(-1) === 'details' || parts.at(-1) === 'log') parts.pop()
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
