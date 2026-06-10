<script setup lang="ts">
import type { StorageEquipment } from '~~/types/inventory'
import { NLink } from '#components'
import { EQUIPMENT_TYPE_LABELS } from '~/utils/inventory/equipment'

const props = defineProps<{
  equipment: StorageEquipment
  roomDocumentId: string
}>()

const equipmentDetailPath = computed(() => `/inventory/equipment/${encodeURIComponent(props.equipment.slug)}`)

const cardBodyTag = computed(() => NLink)
const cardBodyBind = computed(() => ({ to: equipmentDetailPath.value }))

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

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
    class="h-full flex flex-col transition-colors hover:border-primary-400 dark:hover:border-primary-500"
    :_card-content="{ class: 'flex flex-1 flex-col min-h-0' }"
  >
    <div class="flex flex-1 flex-col py-4 min-h-0">
      <component
        :is="cardBodyTag"
        v-bind="cardBodyBind"
        class="flex flex-1 flex-col min-h-0 no-underline text-inherit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer hover:bg-muted/30 -mx-1 px-1 transition-colors"
      >
        <header class="shrink-0 flex items-start justify-between gap-4">
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
          <div class="shrink-0 min-h-14 flex flex-col items-end justify-start">
            <NBadge
              :label="equipment.isActive ? 'Active' : 'Inactive'"
              :badge="equipment.isActive ? 'solid-success' : 'solid-gray'"
            />
          </div>
        </header>

        <NSeparator class="shrink-0 my-4" />

        <div class="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm content-start">
          <IndicatorIconCard
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
          />
        </div>
      </component>

      <NSeparator class="shrink-0 my-4" />

      <footer class="shrink-0 flex flex-wrap items-center justify-end gap-2">
        <DialogMoveEquipment :equipment="equipment" />
        <DialogInventoryEquipmentUpdate
          :equipment="equipment"
          :room-document-id="roomDocumentId"
        />
        <DialogDeleteEquipment
          v-if="isAdmin"
          :equipment="equipment"
          :room-document-id="roomDocumentId"
        />
      </footer>
    </div>
  </NCard>
</template>
