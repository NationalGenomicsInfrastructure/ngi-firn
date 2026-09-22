<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { itemBySlugQuery } from '~/utils/queries/inventory/items'
import { ITEM_TYPE_LABELS } from '~/utils/inventory/item'
import { getContainerStatusMeta } from '~/utils/inventory/container'
import { formatDate } from '~/utils/dates/formatting'

definePageMeta({ layout: 'private' })

const route = useRoute()
const slug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})
const { state, asyncStatus } = useQueryColada(() => itemBySlugQuery(slug.value))
const item = computed(() => state.value.status === 'success' ? state.value.data : null)
const isLoading = computed(() => asyncStatus.value === 'loading')
const typeLabel = computed(() => item.value ? ITEM_TYPE_LABELS[item.value.category] : 'Item')
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="item ? `${item.name} — Details` : 'Item details'"
      :description="typeLabel"
    />
    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading item..."
      description="Fetching item details."
      icon="i-lucide-loader-2"
      class="mt-6"
    />
    <NAlert
      v-else-if="state.status === 'error'"
      alert="border-error"
      title="Item could not be loaded"
      :description="state.error?.message ?? 'Something went wrong while loading item details.'"
      icon="i-lucide-circle-x"
      class="mt-6"
    />
    <NAlert
      v-else-if="!item"
      alert="border-warning"
      title="Item not found"
      description="This item may have been deleted or you may not have access to it."
      icon="i-lucide-search-x"
      class="mt-6"
    />
    <NCard
      v-else
      card="outline-gray"
      class="mt-6"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
        <IndicatorIconText
          icon="i-lucide-key-round"
          label="Identifier"
          :value="item.slug"
        />
        <IndicatorIconText
          icon="i-lucide-package"
          label="Type"
          :value="typeLabel"
        />
        <IndicatorIconText
          icon="i-lucide-tags"
          label="Classification"
          :value="item.classification ?? 'Uncategorized'"
        />
        <IndicatorIconText
          icon="i-lucide-package"
          label="Quantity"
          :value="item.quantity == null ? '—' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`"
        />
        <IndicatorIconText
          icon="i-lucide-flask-conical"
          label="Concentration"
          :value="item.concentration == null ? '—' : `${item.concentration}${item.concentrationUnit ? ` ${item.concentrationUnit}` : ''}`"
        />
        <IndicatorIconText
          icon="i-lucide-map-pin"
          label="Position"
          :value="item.position?.label ?? '—'"
        />
        <IndicatorIconText
          icon="i-lucide-calendar-plus"
          label="Arrival date"
          :value="item.arrivalDate ? formatDate(item.arrivalDate) : '—'"
        />
        <IndicatorIconText
          icon="i-lucide-calendar-check"
          label="Opening date"
          :value="item.openingDate ? formatDate(item.openingDate) : '—'"
        />
        <IndicatorIconText
          icon="i-lucide-calendar-x"
          label="Expiry date"
          :value="item.expiryDate ? formatDate(item.expiryDate) : '—'"
        />
      </div>
      <NSeparator class="my-4" />
      <NBadge
        :label="getContainerStatusMeta(item.status).label"
        :icon="getContainerStatusMeta(item.status).icon"
        :badge="getContainerStatusMeta(item.status).badge"
      />
    </NCard>
  </main>
</template>
