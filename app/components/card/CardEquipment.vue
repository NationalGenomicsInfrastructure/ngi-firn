<script setup lang="ts">
import type { StorageEquipment } from '~~/types/inventory'
import { EQUIPMENT_TYPE_LABELS } from '~/utils/inventory/equipment'

const props = defineProps<{
  equipment: StorageEquipment
  roomDocumentId: string
}>()

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

const equipmentDetailPath = computed(() => `/inventory/equipment/${encodeURIComponent(props.equipment.slug)}`)

const infoFields = computed(() => {
  const gridLabel = props.equipment.rows && props.equipment.columns
    ? `${props.equipment.rows} × ${props.equipment.columns}${props.equipment.levels ? ` × ${props.equipment.levels}` : ''}`
    : '—'

  return [
    {
      icon: 'i-lucide-key-round',
      label: 'Identifier',
      value: props.equipment.slug
    },
    {
      icon: 'i-lucide-thermometer-snowflake',
      label: 'Type',
      value: EQUIPMENT_TYPE_LABELS[props.equipment.equipmentType]
    },
    {
      icon: 'i-lucide-thermometer',
      label: 'Temperature',
      value: props.equipment.temperatureCelsius == null ? '—' : `${props.equipment.temperatureCelsius} °C`
    },
    {
      icon: 'i-lucide-grid-3x3',
      label: 'Grid',
      value: gridLabel
    },
    {
      icon: 'i-lucide-package-open',
      label: 'Capacity',
      value: props.equipment.capacity == null ? '—' : String(props.equipment.capacity)
    },
    {
      icon: 'i-lucide-cog',
      label: 'Manufacturer',
      value: props.equipment.manufacturer ?? '—'
    }
  ]
})
</script>

<template>
  <NCard
    card="outline-gray"
    class="h-full"
    :_card-content="{ class: 'space-y-4 py-4' }"
  >
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
          Storage equipment
        </p>
        <h3 class="text-base font-semibold truncate">
          {{ equipment.name }}
        </h3>
        <p class="text-sm text-muted truncate">
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
      <NButton
        label="Details"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-external-link"
        :to="equipmentDetailPath"
      />
      <DialogInventoryEquipmentUpdate
        :equipment="equipment"
        :room-document-id="roomDocumentId"
      />
      <DialogMoveEquipment :equipment="equipment" />
      <DialogDeleteEquipment
        v-if="isAdmin"
        :equipment="equipment"
        :room-document-id="roomDocumentId"
      />
    </footer>
  </NCard>
</template>
