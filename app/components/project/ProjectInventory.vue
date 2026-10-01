<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { inventoryByProjectQuery } from '~/utils/queries/inventory/projectLinks'

const props = defineProps<{
  projectId: string
}>()

const { state, asyncStatus } = useQuery(() => inventoryByProjectQuery(props.projectId))

const isLoading = computed(() => asyncStatus.value === 'loading')
const isError = computed(() => state.value.status === 'error')
const error = computed(() => state.value.status === 'error' ? state.value.error : undefined)
const containers = computed(() => state.value.status === 'success' ? state.value.data.containers : [])
const items = computed(() => state.value.status === 'success' ? state.value.data.items : [])
const isEmpty = computed(() => state.value.status === 'success' && containers.value.length === 0 && items.value.length === 0)
</script>

<template>
  <div class="mt-6 space-y-8">
    <NAlert
      v-if="isLoading && state.status !== 'success'"
      alert="border-gray"
      title="Loading inventory..."
      description="Fetching items and containers linked to this project."
      icon="i-lucide-loader-2"
    />
    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading inventory"
      :description="error != null ? String(error) : 'Something went wrong. Please try again.'"
      icon="i-lucide-alert-circle"
    />
    <NAlert
      v-else-if="isEmpty"
      alert="border-gray"
      title="No inventory linked"
      description="No items or containers are linked to this project yet. Select entities in the inventory overview and use “Link to Project” to link them."
      icon="i-lucide-package-open"
    />
    <template v-else>
      <section v-if="containers.length > 0">
        <h2 class="mb-3 text-lg font-semibold">
          Containers ({{ containers.length }})
        </h2>
        <TableContainerOverview
          :containers="containers"
          :loading="isLoading"
          :unlink-project-id="projectId"
        />
      </section>
      <section v-if="items.length > 0">
        <h2 class="mb-3 text-lg font-semibold">
          Items ({{ items.length }})
        </h2>
        <TableItemsOverview
          :items="items"
          :loading="isLoading"
          :unlink-project-id="projectId"
        />
      </section>
    </template>
  </div>
</template>
