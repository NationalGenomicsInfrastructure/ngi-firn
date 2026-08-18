<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import {
  equipmentBySlugQuery
} from '~/utils/queries/inventory/equipment'
import { EQUIPMENT_TYPE_LABELS, getEquipmentCapacityLabel } from '~/utils/inventory/equipment'

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

const parentRoomRoute = computed(() =>
  equipment.value ? `/inventory/rooms/${encodeURIComponent(equipment.value.parentRoom.slug)}` : '/inventory/rooms'
)

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

const equipmentTypeLabel = computed(() =>
  equipment.value ? EQUIPMENT_TYPE_LABELS[equipment.value.equipmentType] : '—'
)

const infoFields = computed(() => {
  if (!equipment.value) {
    return []
  }

  return [
    { icon: 'i-lucide-key-round', label: 'Identifier', value: equipment.value.slug },
    { icon: 'i-lucide-thermometer-snowflake', label: 'Type', value: equipmentTypeLabel.value },
    {
      icon: 'i-lucide-thermometer',
      label: 'Temperature',
      value: equipment.value.temperatureCelsius == null ? '—' : `${equipment.value.temperatureCelsius} °C`
    },
    {
      icon: 'i-lucide-package-open',
      label: 'Capacity',
      value: getEquipmentCapacityLabel(equipment.value)
    },
    { icon: 'i-lucide-cog', label: 'Manufacturer', value: equipment.value.manufacturer ?? '—' },
    { icon: 'i-lucide-circuit-board', label: 'Model', value: equipment.value.model ?? '—' },
    { icon: 'i-lucide-hash', label: 'Serial number', value: equipment.value.serialNumber ?? '—' },
    { icon: 'i-lucide-align-left', label: 'Description', value: equipment.value.description ?? '—' }
  ]
})
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
      :title="equipment ? `${equipment.name} — Details` : 'Equipment details'"
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
        card="outline-gray"
        :_card-content="{ class: 'space-y-4 py-4' }"
      >
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Storage equipment
            </p>
            <h3 class="text-lg font-semibold">
              {{ equipment.name }}
            </h3>
            <p class="text-sm text-muted">
              {{ equipment.label || '—' }}
            </p>
          </div>
          <NBadge
            :label="equipment.isActive ? 'Active' : 'Inactive'"
            :badge="equipment.isActive ? 'solid-success' : 'solid-gray'"
          />
        </header>

        <NSeparator />

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          <IndicatorIconText
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
            :class="field.label === 'Description' ? 'sm:col-span-2' : undefined"
          />
        </div>

        <NSeparator />

        <InventoryEquipmentCapacityIndicator :capacity="equipment.capacity" />

        <NSeparator />

        <footer class="flex flex-wrap items-center justify-end gap-2">
          <DialogInventoryEquipmentUpdate
            :equipment="equipment"
            :room-slug="equipment.parentRoom.slug"
          />
          <DialogDeleteEquipment
            v-if="isAdmin"
            :equipment="equipment"
            :room-slug="equipment.parentRoom.slug"
          />
        </footer>
      </NCard>

      <NCard
        title="Equipment location"
        description="Current parent room for this equipment."
        card="outline-gray"
      >
        <IndicatorIconLarge
          icon="i-lucide-building-2"
          label="Assigned to room"
          :value="`${equipment.parentRoom.name} (${equipment.parentRoom.slug})`"
        />

        <NSeparator />

        <div class="flex flex-wrap items-center justify-end gap-4">
          <DialogMoveEquipment :equipment="equipment" />
          <NButton
            label="Open room"
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-building-2"
            :to="parentRoomRoute"
          />
        </div>
      </NCard>

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
