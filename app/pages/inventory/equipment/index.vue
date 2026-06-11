<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { allEquipmentQuery, allRoomsQuery } from '~/utils/queries/inventory/rooms'

definePageMeta({
  layout: 'private'
})

const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(allEquipmentQuery)
const { state: roomsState } = useQueryColada(allRoomsQuery)

const equipment = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : []
)

const rooms = computed(() =>
  roomsState.value.status === 'success' ? roomsState.value.data : []
)

const isLoading = computed(() => equipmentStatus.value === 'loading')
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Storage Equipment"
      description="All storage equipment across all rooms."
    />

    <div class="mt-6">
      <TableEquipmentOverview
        :equipment="equipment"
        :rooms="rooms"
        :loading="isLoading"
      />
    </div>
  </main>
</template>
