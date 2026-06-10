<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import {
  equipmentBySlugQuery,
  roomQuery
} from '~/utils/queries/inventory/rooms'
import { containersByParentQuery } from '~/utils/queries/inventory/containers'
import { itemsByParentQuery } from '~/utils/queries/inventory/items'
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

const parentRoomDocumentId = computed(() => equipment.value?.parent?.id ?? '')
const { state: parentRoomState } = useQueryColada(() => ({
  ...roomQuery(parentRoomDocumentId.value),
  enabled: parentRoomDocumentId.value.length > 0
}))
const parentRoom = computed(() =>
  parentRoomState.value.status === 'success' ? parentRoomState.value.data : null
)

const parentRoomRoute = computed(() =>
  parentRoom.value ? `/inventory/rooms/${encodeURIComponent(parentRoom.value.slug)}` : '/inventory/rooms'
)

const currentEquipmentDocId = computed(() => equipment.value?._id ?? '')
const { state: childContainersState } = useQueryColada(() => ({
  ...containersByParentQuery(currentEquipmentDocId.value),
  enabled: currentEquipmentDocId.value.length > 0
}))
const { state: childItemsState } = useQueryColada(() => ({
  ...itemsByParentQuery(currentEquipmentDocId.value),
  enabled: currentEquipmentDocId.value.length > 0
}))

const childContainerCount = computed(() =>
  childContainersState.value.status === 'success' ? childContainersState.value.data.length : 0
)

const childItemCount = computed(() =>
  childItemsState.value.status === 'success' ? childItemsState.value.data.length : 0
)

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

const equipmentTypeLabel = computed(() =>
  equipment.value ? EQUIPMENT_TYPE_LABELS[equipment.value.equipmentType] : '—'
)

const gridLabel = computed(() => {
  if (!equipment.value || !equipment.value.rows || !equipment.value.columns) {
    return '—'
  }

  return `${equipment.value.rows} × ${equipment.value.columns}${equipment.value.levels ? ` × ${equipment.value.levels}` : ''}`
})

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
    { icon: 'i-lucide-grid-3x3', label: 'Grid', value: gridLabel.value },
    {
      icon: 'i-lucide-package-open',
      label: 'Capacity',
      value: equipment.value.capacity == null ? '—' : String(equipment.value.capacity)
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
    <PageTitle
      :title="equipment ? equipment.name : 'Equipment details'"
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
          <div
            v-for="field in infoFields"
            :key="field.label"
          >
            <div class="flex items-center gap-1.5 mb-0.5">
              <NIcon
                :name="field.icon"
                class="text-primary-400 dark:text-primary-600 text-xs"
              />
              <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
                {{ field.label }}
              </span>
            </div>
            <p class="font-medium pl-5">
              {{ field.value }}
            </p>
          </div>
        </div>

        <NSeparator />

        <footer class="flex flex-wrap items-center justify-end gap-2">
          <DialogInventoryEquipmentUpdate
            :equipment="equipment"
            :room-document-id="equipment.parent.id"
          />
          <DialogDeleteEquipment
            v-if="isAdmin"
            :equipment="equipment"
            :room-document-id="equipment.parent.id"
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
        :value="parentRoom ? `${parentRoom.name} (${parentRoom.slug})` : `Room document: ${equipment.parent.id}`"
      />
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

      <NCard
        title="Top-level children"
        description="Containers and items directly placed in this equipment."
        card="outline-gray"
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <IndicatorIconLarge
            icon="i-lucide-box"
            label="Containers"
            :value="childContainerCount"
          />
          <IndicatorIconLarge
            icon="i-lucide-test-tubes"
            label="Items"
            :value="childItemCount"
          />
        </div>
        <NAlert
          class="mt-4"
          alert="border-gray"
          title="Container management coming next"
          description="This page is prepared for upcoming container tree/table components."
          icon="i-lucide-list-tree"
        />
      </NCard>

      <div class="flex justify-end">
        <NButton
          label="Back to rooms"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-arrow-left"
          to="/inventory/rooms"
        />
      </div>
    </div>
  </main>
</template>
