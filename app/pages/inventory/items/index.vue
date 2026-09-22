<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { allItemsQuery } from '~/utils/queries/inventory/items'

definePageMeta({
  layout: 'private'
})

const { state: itemsState, asyncStatus: itemsStatus } = useQueryColada(allItemsQuery)

const items = computed(() =>
  itemsState.value.status === 'success' ? itemsState.value.data : []
)

const isLoading = computed(() => itemsStatus.value === 'loading')
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Items"
      description="All inventory items across all storage equipment and parent containers."
    />

    <div class="mt-6 flex justify-end">
      <NButton
        leading="i-lucide-package-plus"
        btn="soft-primary hover:outline-primary"
        size="sm"
        label="Register new item"
        to="/inventory/items/add"
      />
    </div>

    <div class="mt-4">
      <TableItemsOverview
        :items="items"
        :loading="isLoading"
      />
    </div>
  </main>
</template>
