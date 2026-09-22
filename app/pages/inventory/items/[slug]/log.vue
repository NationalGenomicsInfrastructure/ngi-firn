<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { itemBySlugQuery } from '~/utils/queries/inventory/items'
import { ITEM_TYPE_LABELS } from '~/utils/inventory/item'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const slug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const { state: itemState, asyncStatus: itemStatus } = useQueryColada(
  () => itemBySlugQuery(slug.value)
)

const isLoading = computed(() => itemStatus.value === 'loading')
const isError = computed(() => itemState.value.status === 'error')
const item = computed(() =>
  itemState.value.status === 'success' ? itemState.value.data : null
)
const itemTypeLabel = computed(() =>
  item.value ? ITEM_TYPE_LABELS[item.value.category] : '—'
)
const detailRoute = computed(() => `/inventory/items/${encodeURIComponent(slug.value)}/details`)
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="item ? `${item.name} — Action Log` : 'Item action log'"
      :description="itemTypeLabel"
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
      v-else-if="isError"
      alert="border-error"
      title="Error loading item"
      :description="itemState.error?.message ?? 'Something went wrong while loading item details.'"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="item == null"
      alert="border-warning"
      title="Item not found"
      description="No item exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <InventoryItemTabs />

      <TableItemActionLog
        :entries="item.recentActionLog"
        :slug="item.slug"
      />

      <div class="flex justify-end mt-4">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to item details"
          :to="detailRoute"
        />
      </div>
    </div>
  </main>
</template>
