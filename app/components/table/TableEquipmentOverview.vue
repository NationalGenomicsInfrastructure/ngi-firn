<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { EQUIPMENT_TYPE_LABELS } from '~/utils/inventory/equipment'

const props = defineProps<{
  equipment: DisplayStorageEquipment[]
  loading?: boolean
}>()

interface EquipmentRow {
  slug: string
  name: string
  label: string | null
  equipmentType: DisplayStorageEquipment['equipmentType']
  typeLabel: string
  parentRoomName: string
  parentRoomSlug: string
  temperatureCelsius: number | null
  temperatureLabel: string
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  description: string | null
  isActive: boolean
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

// Keep every column visually uniform: links and badges share the table's `text-sm`
// weight/size instead of the badge preset's smaller `text-xs`.
const TABLE_LINK_STYLE = 'text-sm font-medium hover:underline'
const TABLE_BADGE_UNA = { badge: '!text-sm !font-medium' }

const columns: ColumnDef<EquipmentRow>[] = [
  {
    header: 'Name',
    accessorKey: 'name',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-medium',
        tableHead: TABLE_HEAD_STYLE
      }
    }
  },
  { header: 'Type', accessorKey: 'typeLabel' },
  { header: 'Room', accessorKey: 'parentRoomName' },
  { header: 'Temperature', accessorKey: 'temperatureLabel' },
  { header: 'Status', accessorKey: 'isActive' }
]

const tableData = computed((): EquipmentRow[] => {
  return props.equipment.map(eq => ({
    slug: eq.slug,
    name: eq.name,
    label: eq.label,
    equipmentType: eq.equipmentType,
    typeLabel: EQUIPMENT_TYPE_LABELS[eq.equipmentType] ?? eq.equipmentType,
    parentRoomName: eq.parentRoom.name,
    parentRoomSlug: eq.parentRoom.slug,
    temperatureCelsius: eq.temperatureCelsius,
    temperatureLabel: eq.temperatureCelsius == null ? '—' : `${eq.temperatureCelsius} °C`,
    manufacturer: eq.manufacturer,
    model: eq.model,
    serialNumber: eq.serialNumber,
    description: eq.description,
    isActive: eq.isActive
  }))
})

const pagination = ref({ pageSize: 20, pageIndex: 0 })
const expanded = ref<Record<string, boolean>>({})
const table = useTemplateRef<Table<EquipmentRow>>('table')
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="tableData"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      :pagination="pagination"
      enable-sorting
      enable-multi-sort
      empty-text="No storage equipment found"
      empty-icon="i-lucide-thermometer-snowflake"
    >
      <template #name-cell="{ cell }">
        <NuxtLink
          :to="`/inventory/equipment/${encodeURIComponent(cell.row.original.slug)}/details`"
          class="text-primary-400 dark:text-primary-600"
          :class="TABLE_LINK_STYLE"
        >
          {{ cell.row.original.name }}
        </NuxtLink>
      </template>

      <template #typeLabel-cell="{ cell }">
        <NBadge
          :label="cell.row.original.typeLabel"
          badge="soft-primary"
          :una="TABLE_BADGE_UNA"
        />
      </template>

      <template #parentRoomName-cell="{ cell }">
        <NuxtLink
          v-if="cell.row.original.parentRoomSlug"
          :to="`/inventory/rooms/${encodeURIComponent(cell.row.original.parentRoomSlug)}`"
          class="text-muted"
          :class="TABLE_LINK_STYLE"
        >
          {{ cell.row.original.parentRoomName }}
        </NuxtLink>
        <span
          v-else
          class="text-muted text-sm font-medium"
        >{{ cell.row.original.parentRoomName }}</span>
      </template>

      <template #isActive-cell="{ cell }">
        <div class="flex items-center justify-between gap-6 w-full">
          <NBadge
            :label="cell.row.original.isActive ? 'Active' : 'Inactive'"
            :badge="cell.row.original.isActive ? 'solid-success' : 'solid-gray'"
            :una="TABLE_BADGE_UNA"
          />
          <NTooltip
            content="View equipment details"
          >
            <NButton
              label="i-lucide-file-input"
              icon
              btn="ghost-gray"
              size="xs"
              :to="`/inventory/equipment/${encodeURIComponent(cell.row.original.slug)}/details`"
            />
          </NTooltip>
        </div>
      </template>

      <template #expanded="{ row }">
        <div class="-m-4 p-4 border-l-18 border-primary-700 dark:border-primary-900">
          <div class="flex justify-center my-3 p-2 bg-gray-100 dark:bg-gray-800">
            <h2 class="text-center text-xl font-semibold tracking-tight">
              {{ row.original.name }} {{ row.original.label ? ` (${row.original.label})` : '' }}
            </h2>
          </div>
          <div class="p-4 text-sm bg-muted/30 rounded-md">
            <div class="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 items-start">
              <div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                  <IndicatorIconText
                    icon="i-lucide-key-round"
                    label="Identifier"
                    :value="row.original.slug"
                  />
                  <IndicatorIconText
                    icon="i-lucide-thermometer-snowflake"
                    label="Type"
                    :value="row.original.typeLabel"
                  />
                  <IndicatorIconText
                    icon="i-lucide-thermometer"
                    label="Temperature"
                    :value="row.original.temperatureLabel"
                  />
                  <IndicatorIconText
                    icon="i-lucide-cog"
                    label="Manufacturer"
                    :value="row.original.manufacturer ?? '—'"
                  />
                  <IndicatorIconText
                    icon="i-lucide-tag"
                    label="Model"
                    :value="row.original.model ?? '—'"
                  />
                  <IndicatorIconText
                    icon="i-lucide-hash"
                    label="Serial number"
                    :value="row.original.serialNumber ?? '—'"
                  />
                  <IndicatorIconText
                    icon="i-lucide-building-2"
                    label="Room"
                    :value="row.original.parentRoomName"
                  />
                </div>

                <template v-if="row.original.description">
                  <NSeparator class="my-4" />
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <NIcon
                      name="i-lucide-file-text"
                      class="text-primary-400 dark:text-primary-600 text-xs"
                    />
                    <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Description</span>
                  </div>
                  <p class="font-medium pl-5">
                    {{ row.original.description }}
                  </p>
                </template>
              </div>

              <div class="flex flex-col items-end flex-shrink-0 gap-2 w-full">
                <NButton
                  label="View contents"
                  btn="soft-primary hover:outline-primary"
                  leading="i-lucide-refrigerator"
                  :to="`/inventory/equipment/${encodeURIComponent(row.original.slug)}/contents`"
                  class="w-full"
                />
                <NButton
                  label="View details"
                  btn="soft-primary hover:outline-primary"
                  leading="i-lucide-book-open-text"
                  :to="`/inventory/equipment/${encodeURIComponent(row.original.slug)}/details`"
                  class="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </NTable>

    <div
      v-if="(table?.getFilteredRowModel().rows.length ?? 0) > 20"
      class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4"
    >
      <div class="flex items-center justify-center text-sm font-medium">
        Page {{ (table?.getState().pagination.pageIndex ?? 0) + 1 }} of
        {{ table?.getPageCount().toLocaleString() }}
      </div>

      <NPagination
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 20"
        @update:page="table?.setPageIndex($event - 1)"
      />
    </div>
  </div>
</template>
