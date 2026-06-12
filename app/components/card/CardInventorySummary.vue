<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { inventoryCountsQuery } from '~/utils/queries/inventory'

const { state, asyncStatus } = useQuery(inventoryCountsQuery)
const isLoading = computed(() => asyncStatus.value === 'loading')
const counts = computed(() =>
  state.value.status === 'success' ? state.value.data : undefined
)
</script>

<template>
  <NCard
    card="soft-primary"
    class="my-auto"
    :_card-content="{ class: 'p-3' }"
  >
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <IndicatorIconLarge
        icon="i-lucide-building-2"
        label="Rooms"
        :value="isLoading ? '…' : (counts?.rooms ?? '—')"
      />
      <IndicatorIconLarge
        icon="i-lucide-refrigerator"
        label="Equipment"
        :value="isLoading ? '…' : (counts?.equipment ?? '—')"
      />
      <IndicatorIconLarge
        icon="i-lucide-box"
        label="Containers"
        :value="isLoading ? '…' : (counts?.containers ?? '—')"
      />
      <IndicatorIconLarge
        icon="i-lucide-test-tubes"
        label="Items"
        :value="isLoading ? '…' : (counts?.items ?? '—')"
      />
    </div>
  </NCard>
</template>
