<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { allContainersQuery } from '~/utils/queries/inventory/containers'

definePageMeta({
  layout: 'private'
})

const { state: containersState, asyncStatus: containersStatus } = useQueryColada(allContainersQuery)

const containers = computed(() =>
  containersState.value.status === 'success' ? containersState.value.data : []
)

const isLoading = computed(() => containersStatus.value === 'loading')
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Containers"
      description="All containers across all storage equipment and parent containers."
    />

    <div class="mt-6 flex justify-end">
      <NButton
        leading="i-lucide-plus"
        btn="soft-primary hover:outline-primary"
        size="sm"
        label="Add container"
        to="/inventory/containers/add"
      />
    </div>

    <div class="mt-4">
      <TableContainerOverview
        :containers="containers"
        :loading="isLoading"
      />
    </div>
  </main>
</template>
