<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { allEquipmentQuery } from '~/utils/queries/inventory/equipment'

definePageMeta({
  layout: 'private'
})

const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(allEquipmentQuery)

const equipment = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : []
)

const isLoading = computed(() => equipmentStatus.value === 'loading')
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Storage Equipment"
      description="All storage equipment across all rooms."
    />

    <div class="mt-6 flex justify-end">
      <NButton
        leading="i-lucide-between-horizontal-end"
        btn="soft-primary hover:outline-primary"
        size="sm"
        label="Add storage equipment"
        to="/inventory/equipment/add"
      />
    </div>

    <div class="mt-6">
      <TableEquipmentOverview
        :equipment="equipment"
        :loading="isLoading"
      />
    </div>
  </main>
</template>
