<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { itemsByEquipmentQuery } from '~/utils/queries/inventory/items'

const props = defineProps<{
  equipment: DisplayStorageEquipment
}>()

const { state, asyncStatus } = useQueryColada(() => itemsByEquipmentQuery(props.equipment.slug))

const items = computed(() => state.value.status === 'success' ? state.value.data : [])
const isLoading = computed(() => asyncStatus.value === 'loading')
const errorMessage = computed(() =>
  state.value.status === 'error'
    ? state.value.error?.message ?? 'Something went wrong while loading items.'
    : undefined
)
</script>

<template>
  <PageHeadline section="Items in this equipment" />
  <NTabs default-value="list">
    <NTabsList class="mx-auto">
      <NTabsTrigger value="list">
        <NIcon name="i-lucide-list" />
        List items
      </NTabsTrigger>
      <NTabsTrigger value="add">
        <NIcon name="i-lucide-plus" />
        Add item
      </NTabsTrigger>
    </NTabsList>

    <NTabsContent
      value="list"
      class="mt-4"
    >
      <NAlert
        v-if="isLoading"
        alert="border-gray"
        title="Loading items..."
        description="Fetching items stored directly in this equipment."
        icon="i-lucide-loader-2"
      />
      <NAlert
        v-else-if="errorMessage"
        alert="border-error"
        title="Error loading items"
        :description="errorMessage"
        icon="i-lucide-alert-circle"
      />
      <NAlert
        v-else-if="items.length === 0"
        alert="border-warning"
        title="No items registered"
        description="This equipment has no directly stored items yet."
        icon="i-lucide-package-open"
      />
      <TableItemsOverview
        v-else
        :items="items"
        :loading="isLoading"
      />
    </NTabsContent>

    <NTabsContent
      value="add"
      class="mt-4"
    >
      <StepperInventoryItemAdd
        :parent-slug="equipment.slug"
        parent-kind="equipment"
      />
    </NTabsContent>
  </NTabs>
</template>
