<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import type { Room, StorageEquipment } from '~~/types/inventory'
import { EQUIPMENT_TYPE_LABELS } from '~/utils/inventory/equipment'

const props = defineProps<{
  equipment: StorageEquipment[]
  rooms: Room[]
  loading?: boolean
}>()

interface EquipmentRow {
  _id: string
  slug: string
  name: string
  label: string | null
  equipmentType: StorageEquipment['equipmentType']
  typeLabel: string
  roomName: string
  roomSlug: string
  temperatureCelsius: number | null
  temperatureLabel: string
  rows: number | null
  columns: number | null
  levels: number | null
  gridLabel: string
  capacity: number | null
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  description: string | null
  isActive: boolean
  parentRoomId: string
  _rev: string
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

const columns: ColumnDef<EquipmentRow>[] = [
  {
    header: 'Name',
    accessorKey: 'name',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: TABLE_HEAD_STYLE
      }
    }
  },
  { header: 'Type', accessorKey: 'typeLabel' },
  { header: 'Room', accessorKey: 'roomName' },
  { header: 'Temperature', accessorKey: 'temperatureLabel' },
  { header: 'Status', accessorKey: 'isActive' }
]

const roomMap = computed(() => {
  const map = new Map<string, Room>()
  for (const room of props.rooms) {
    map.set(room._id, room)
  }
  return map
})

const tableData = computed((): EquipmentRow[] => {
  return props.equipment.map((eq) => {
    const room = roomMap.value.get(eq.parent.id)
    const gridLabel = eq.rows && eq.columns
      ? `${eq.rows} × ${eq.columns}${eq.levels ? ` × ${eq.levels}` : ''}`
      : '—'
    return {
      _id: eq._id,
      _rev: eq._rev,
      slug: eq.slug,
      name: eq.name,
      label: eq.label,
      equipmentType: eq.equipmentType,
      typeLabel: EQUIPMENT_TYPE_LABELS[eq.equipmentType] ?? eq.equipmentType,
      roomName: room?.name ?? '—',
      roomSlug: room?.slug ?? '',
      temperatureCelsius: eq.temperatureCelsius,
      temperatureLabel: eq.temperatureCelsius == null ? '—' : `${eq.temperatureCelsius} °C`,
      rows: eq.rows,
      columns: eq.columns,
      levels: eq.levels,
      gridLabel,
      capacity: eq.capacity,
      manufacturer: eq.manufacturer,
      model: eq.model,
      serialNumber: eq.serialNumber,
      description: eq.description,
      isActive: eq.isActive,
      parentRoomId: eq.parent.id
    }
  })
})

// Re-hydrate a full StorageEquipment from a row (needed by DialogMoveEquipment)
function rowToEquipment(row: EquipmentRow): StorageEquipment {
  return props.equipment.find(eq => eq._id === row._id)!
}

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
          :to="`/inventory/equipment/${encodeURIComponent(cell.row.original.slug)}`"
          class="text-primary-400 dark:text-primary-600 hover:underline font-semibold"
        >
          {{ cell.row.original.name }}
        </NuxtLink>
      </template>

      <template #typeLabel-cell="{ cell }">
        <NBadge
          :label="cell.row.original.typeLabel"
          badge="soft-primary"
        />
      </template>

      <template #roomName-cell="{ cell }">
        <NuxtLink
          v-if="cell.row.original.roomSlug"
          :to="`/inventory/rooms/${encodeURIComponent(cell.row.original.roomSlug)}`"
          class="text-muted hover:underline"
        >
          {{ cell.row.original.roomName }}
        </NuxtLink>
        <span
          v-else
          class="text-muted"
        >{{ cell.row.original.roomName }}</span>
      </template>

      <template #isActive-cell="{ cell }">
        <NBadge
          :label="cell.row.original.isActive ? 'Active' : 'Inactive'"
          :badge="cell.row.original.isActive ? 'solid-success' : 'solid-gray'"
        />
      </template>

      <template #expanded="{ row }">
        <div class="p-4 text-sm bg-muted/30 rounded-md">
          <!-- Header row in expanded section -->
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
                Storage equipment
              </p>
              <h3 class="text-base font-semibold">
                {{ row.original.name }}
              </h3>
              <p
                v-if="row.original.label"
                class="text-sm text-muted"
              >
                {{ row.original.label }}
              </p>
            </div>
            <NBadge
              :label="row.original.isActive ? 'Active' : 'Inactive'"
              :badge="row.original.isActive ? 'solid-success' : 'solid-gray'"
            />
          </div>

          <NSeparator class="my-4" />

          <!-- Info fields grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <IndicatorIconCard
              icon="i-lucide-key-round"
              label="Identifier"
              :value="row.original.slug"
            />
            <IndicatorIconCard
              icon="i-lucide-thermometer-snowflake"
              label="Type"
              :value="row.original.typeLabel"
            />
            <IndicatorIconCard
              icon="i-lucide-thermometer"
              label="Temperature"
              :value="row.original.temperatureLabel"
            />
            <IndicatorIconCard
              icon="i-lucide-grid-3x3"
              label="Grid"
              :value="row.original.gridLabel"
            />
            <IndicatorIconCard
              icon="i-lucide-package-open"
              label="Capacity"
              :value="row.original.capacity == null ? '—' : String(row.original.capacity)"
            />
            <IndicatorIconCard
              icon="i-lucide-cog"
              label="Manufacturer"
              :value="row.original.manufacturer ?? '—'"
            />
            <IndicatorIconCard
              icon="i-lucide-tag"
              label="Model"
              :value="row.original.model ?? '—'"
            />
            <IndicatorIconCard
              icon="i-lucide-hash"
              label="Serial number"
              :value="row.original.serialNumber ?? '—'"
            />
            <IndicatorIconCard
              icon="i-lucide-building-2"
              label="Room"
              :value="row.original.roomName"
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

          <NSeparator class="my-4" />

          <!-- Footer actions -->
          <div class="flex flex-wrap items-center justify-end gap-2">
            <NButton
              label="View contents"
              btn="soft-primary hover:outline-primary"
              leading="i-lucide-eye"
              :to="`/inventory/equipment/${encodeURIComponent(row.original.slug)}`"
            />
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
