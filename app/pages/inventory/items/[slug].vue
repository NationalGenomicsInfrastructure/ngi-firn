<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { InventoryItem } from '~~/types/inventory'
import { itemBySlugQuery } from '~/utils/queries/inventory/items'
import {
  ITEM_CATEGORY_LABELS,
  ITEM_CLASSIFICATION_LABELS,
  ITEM_STATUS_LABELS
} from '~/utils/inventory/items'

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

const errorMessage = computed(() => {
  if (itemState.value.status !== 'error') {
    return undefined
  }

  const message = itemState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading item details.'
})

const item = computed(() =>
  itemState.value.status === 'success' ? itemState.value.data : null
)

const categoryLabel = computed(() =>
  item.value ? ITEM_CATEGORY_LABELS[item.value.category] : '—'
)

const classificationLabel = computed(() =>
  item.value ? ITEM_CLASSIFICATION_LABELS[item.value.classification] : '—'
)

const statusLabel = computed(() =>
  item.value ? ITEM_STATUS_LABELS[item.value.status] : '—'
)

const quantityDisplay = computed(() => {
  if (!item.value) return '—'
  if (item.value.quantity == null) return '—'
  return `${item.value.quantity}${item.value.unit ? ` ${item.value.unit}` : ''}`
})

const concentrationDisplay = computed(() => {
  if (!item.value) return '—'
  if (item.value.concentration == null) return '—'
  return `${item.value.concentration}${item.value.concentrationUnit ? ` ${item.value.concentrationUnit}` : ''}`
})

const infoFields = computed(() => {
  if (!item.value) {
    return []
  }

  return [
    { icon: 'i-lucide-key-round', label: 'Identifier', value: item.value.slug },
    { icon: 'i-lucide-box', label: 'Category', value: categoryLabel.value },
    { icon: 'i-lucide-tag', label: 'Classification', value: classificationLabel.value },
    { icon: 'i-lucide-check-circle', label: 'Status', value: statusLabel.value },
    { icon: 'i-lucide-package', label: 'Quantity', value: quantityDisplay.value },
    { icon: 'i-lucide-flask-conical', label: 'Concentration', value: concentrationDisplay.value },
    { icon: 'i-lucide-calendar', label: 'Expiry date', value: item.value.expiryDate ?? '—' },
    { icon: 'i-lucide-code', label: 'Lot number', value: item.value.lotNumber ?? '—' },
    { icon: 'i-lucide-barcode', label: 'Barcode', value: item.value.barcode ?? '—' },
    { icon: 'i-lucide-align-left', label: 'Notes', value: item.value.notes ?? '—' }
  ]
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="item ? item.name : 'Item details'"
      :description="categoryLabel"
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading item..."
      description="Fetching inventory item details."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading item"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="item == null"
      alert="border-warning"
      title="Item not found"
      description="No inventory item exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <NCard
        card="outline-gray"
        :_card-content="{ class: 'space-y-4 py-4' }"
      >
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Inventory item
            </p>
            <h3 class="text-lg font-semibold">
              {{ item.name }}
            </h3>
            <p class="text-sm text-muted">
              {{ item.label || '—' }}
            </p>
          </div>
          <NBadge
            :label="statusLabel"
            :badge="item.status === 'available' ? 'solid-success' : 'solid-gray'"
          />
        </header>

        <NSeparator />

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          <IndicatorIconCard
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
          />
        </div>

        <NSeparator />

        <footer class="flex flex-wrap items-center justify-end gap-2">
          <DialogInventoryItemUpdate :item="item" />
        </footer>
      </NCard>

      <NCard
        title="Audit log"
        description="History of actions on this item"
        card="outline-gray"
      >
        <div
          v-if="item.actionLog && item.actionLog.length > 0"
          class="space-y-4"
        >
          <div
            v-for="(entry, index) in item.actionLog"
            :key="index"
            class="flex items-start gap-4 pb-4 border-b last:border-b-0"
          >
            <div class="shrink-0">
              <NIcon
                name="i-lucide-history"
                class="text-primary-400 dark:text-primary-600"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium">
                {{ entry.actionType }}
              </p>
              <p class="text-sm text-muted">
                {{ entry.timestamp }}
              </p>
              <p
                v-if="entry.userId"
                class="text-xs text-muted"
              >
                By: {{ entry.userId }}
              </p>
              <p
                v-if="entry.notes"
                class="text-sm mt-1"
              >
                {{ entry.notes }}
              </p>
            </div>
          </div>
        </div>
        <div
          v-else
          class="text-sm text-muted"
        >
          No action history yet.
        </div>
      </NCard>

      <div class="flex justify-end">
        <NButton
          label="Back to containers"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-arrow-left"
          to="/inventory/containers"
        />
      </div>
    </div>
  </main>
</template>
