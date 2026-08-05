<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { containerBySlugQuery } from '~/utils/queries/inventory/containers'
import { CONTAINER_TYPE_LABELS } from '~/utils/inventory/equipment'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const slug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const { state: containerState, asyncStatus: containerStatus } = useQueryColada(
  () => containerBySlugQuery(slug.value)
)

const isLoading = computed(() => containerStatus.value === 'loading')
const isError = computed(() => containerState.value.status === 'error')

const errorMessage = computed(() => {
  if (containerState.value.status !== 'error') return undefined
  const message = containerState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading container details.'
})

const container = computed(() =>
  containerState.value.status === 'success' ? containerState.value.data : null
)

const containerTypeLabel = computed(() =>
  container.value ? CONTAINER_TYPE_LABELS[container.value.containerType] : '—'
)
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="container ? `${container.name} — Contents` : 'Container contents'"
      :description="containerTypeLabel"
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading container..."
      description="Fetching container details."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading container"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="container == null"
      alert="border-warning"
      title="Container not found"
      description="No container exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <InventoryTabs />

      <InventoryContainerChildrenSection :container="container" />

      <div class="flex justify-end mt-4">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to containers"
          to="/inventory/containers"
        />
      </div>
    </div>
  </main>
</template>
