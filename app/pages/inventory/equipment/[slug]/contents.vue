<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import {
  equipmentBySlugQuery
} from '~/utils/queries/inventory/equipment'
import { EQUIPMENT_TYPE_LABELS } from '~/utils/inventory/equipment'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const slug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(
  () => equipmentBySlugQuery(slug.value)
)

const isLoading = computed(() => equipmentStatus.value === 'loading')
const isError = computed(() => equipmentState.value.status === 'error')

const errorMessage = computed(() => {
  if (equipmentState.value.status !== 'error') {
    return undefined
  }

  const message = equipmentState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading equipment details.'
})

const equipment = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : null
)

const equipmentTypeLabel = computed(() =>
  equipment.value ? EQUIPMENT_TYPE_LABELS[equipment.value.equipmentType] : '—'
)
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <NButton
      btn="ghost-gray"
      leading="i-lucide-arrow-left"
      size="sm"
      label="Back to equipment list"
      to="/inventory/equipment"
    />
    <PageTitle
      :title="equipment ? `${equipment.name} — Contents` : 'Equipment contents'"
      :description="equipmentTypeLabel"
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading equipment..."
      description="Fetching storage equipment details."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading equipment"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="equipment == null"
      alert="border-warning"
      title="Equipment not found"
      description="No storage equipment exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <InventoryEquipmentTabs />

      <NCard
        v-if="equipment.capacity && equipment.capacity.length > 0"
        card="soft-gray"
      >
        <InventoryEquipmentCapacityBars :capacity="equipment.capacity" />
      </NCard>

      <InventoryEquipmentContainerSection :equipment="equipment" />

      <div class="flex justify-end mt-4">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to equipment list"
          to="/inventory/equipment"
        />
      </div>
    </div>
  </main>
</template>
