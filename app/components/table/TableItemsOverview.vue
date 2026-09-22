<script setup lang="ts">
import type { ColumnDef, RowSelectionState, Table } from '@tanstack/vue-table'
import type { DisplayInventoryItem, InventoryActiveFlag, SerializedEntityRef } from '~~/types/inventory'
import type { ItemType } from '~~/schemas/inventory/items'
import type { InventoryClassificationType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import { ITEM_TYPE_ICONS, ITEM_TYPE_LABELS } from '~/utils/inventory/item'
import { getClassificationBadge, getContainerStatusMeta } from '~/utils/inventory/container'
import { formatDate } from '~/utils/dates/formatting'

const props = withDefaults(defineProps<{ items: DisplayInventoryItem[], loading?: boolean, showParent?: boolean }>(), {
  loading: false,
  showParent: true
})

interface ItemRow {
  slug: string
  name: string
  label: string | null
  category: ItemType
  typeLabel: string
  typeIcon: string
  classification: InventoryClassificationType | null
  status: InventoryStatusType
  quantity: number | null
  unit: string | null
  concentration: number | null
  concentrationUnit: string | null
  positionLabel: string | null
  arrivalDate: string | null
  openingDate: string | null
  expiryDate: string | null
  lotNumber: string | null
  barcode: string | null
  description: string | null
  parentName: string
  parentSlug: string | null
  parentKind: SerializedEntityRef['kind'] | null
  templateId: string | null
  projectRefs: SerializedEntityRef[]
  activeFlags: InventoryActiveFlag[]
  createdAt: string
  updatedAt: string
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
const TABLE_LINK_STYLE = 'text-sm font-medium hover:underline'
const TABLE_BADGE_UNA = { badge: '!text-sm !font-medium' }

const columns = computed<ColumnDef<ItemRow>[]>(() => {
  const columns: ColumnDef<ItemRow>[] = [
    { header: 'Name', accessorKey: 'name', meta: { una: { tableCell: 'text-primary-700 dark:text-primary-400 font-medium', tableHead: TABLE_HEAD_STYLE } } },
    { header: 'Type', accessorKey: 'typeLabel' },
    { header: 'Classification', accessorKey: 'classification' },
    { header: 'Quantity', accessorKey: 'quantity' }
  ]
  if (props.showParent) columns.push({ header: 'Parent', accessorKey: 'parentName' })
  columns.push({ header: 'Status', accessorKey: 'status' })
  return columns
})

function itemUrl(slug: string): string {
  return `/inventory/items/${encodeURIComponent(slug)}/details`
}

function parentUrl(row: ItemRow): string | null {
  if (!row.parentSlug || !row.parentKind) return null
  return row.parentKind === 'equipment'
    ? `/inventory/equipment/${encodeURIComponent(row.parentSlug)}/details`
    : `/inventory/containers/${encodeURIComponent(row.parentSlug)}`
}

const tableData = computed<ItemRow[]>(() => props.items.map(item => ({
  slug: item.slug,
  name: item.name,
  label: item.label,
  category: item.category,
  typeLabel: ITEM_TYPE_LABELS[item.category] ?? item.category,
  typeIcon: ITEM_TYPE_ICONS[item.category] ?? 'i-lucide-package',
  classification: item.classification,
  status: item.status,
  quantity: item.quantity,
  unit: item.unit,
  concentration: item.concentration,
  concentrationUnit: item.concentrationUnit,
  positionLabel: item.position?.label ?? null,
  arrivalDate: item.arrivalDate,
  openingDate: item.openingDate,
  expiryDate: item.expiryDate,
  lotNumber: item.lotNumber,
  barcode: item.barcode,
  description: item.description,
  parentName: item.parentRef?.name ?? '—',
  parentSlug: item.parentRef?.slug ?? null,
  parentKind: item.parentRef?.kind ?? null,
  templateId: item.templateId,
  projectRefs: item.projectRefs ?? [],
  activeFlags: item.activeFlags ?? [],
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
})))

const pagination = ref({ pageSize: 20, pageIndex: 0 })
const expanded = ref<Record<string, boolean>>({})
const select = ref<RowSelectionState>()
const table = useTemplateRef<Table<ItemRow>>('table')
const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)
const itemBySlug = computed(() => new Map(props.items.map(item => [item.slug, item])))
const selectedItems = computed<DisplayInventoryItem[]>(() => {
  void select.value
  return (table.value?.getFilteredSelectedRowModel().rows ?? [])
    .map(row => itemBySlug.value.get(row.original.slug))
    .filter((item): item is DisplayInventoryItem => item != null)
})
const allSelectedLost = computed(() => selectedItems.value.length > 0 && selectedItems.value.every(item => item.status === 'lost'))
const canMoveSelection = computed(() => selectedItems.value.length > 0 && selectedItems.value.every(item => item.status !== 'lost' && item.status !== 'disposed'))
function clearSelection() {
  select.value = undefined
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:expanded="expanded"
      v-model:row-selection="select"
      :loading="loading"
      :columns="columns"
      :data="tableData"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      :pagination="pagination"
      enable-row-selection
      enable-sorting
      enable-multi-sort
      empty-text="No items found"
      empty-icon="i-lucide-package"
    >
      <template #name-cell="{ cell }">
        <div class="flex flex-wrap items-center gap-2">
          <NuxtLink
            :to="itemUrl(cell.row.original.slug)"
            class="text-primary-400 dark:text-primary-600"
            :class="TABLE_LINK_STYLE"
          >{{ cell.row.original.name }}</NuxtLink>
          <BadgesInventoryFlag
            v-for="flag in cell.row.original.activeFlags"
            :key="flag.kind"
            :flag="flag.kind"
            :comment="flag.comment"
            icon-only
          />
        </div>
      </template>
      <template #typeLabel-cell="{ cell }">
        <NBadge
          :label="cell.row.original.typeLabel"
          :icon="cell.row.original.typeIcon"
          badge="soft-primary"
          :una="TABLE_BADGE_UNA"
        />
      </template>
      <template #classification-cell="{ cell }">
        <NBadge
          :label="cell.row.original.classification ?? 'Uncategorized'"
          :badge="cell.row.original.classification ? getClassificationBadge(cell.row.original.classification) : 'soft-gray'"
          :una="TABLE_BADGE_UNA"
        />
      </template>
      <template #quantity-cell="{ cell }">
        {{ cell.row.original.quantity ?? '—' }}{{ cell.row.original.unit ? ` ${cell.row.original.unit}` : '' }}
      </template>
      <template #parentName-cell="{ cell }">
        <NuxtLink
          v-if="parentUrl(cell.row.original)"
          :to="parentUrl(cell.row.original)!"
          class="text-muted"
          :class="TABLE_LINK_STYLE"
        >{{ cell.row.original.parentName }}</NuxtLink>
        <span
          v-else
          class="text-muted text-sm font-medium"
        >{{ cell.row.original.parentName }}</span>
      </template>
      <template #status-cell="{ cell }">
        <div class="flex items-center justify-between gap-6 w-full">
          <NBadge
            :label="getContainerStatusMeta(cell.row.original.status).label"
            :icon="getContainerStatusMeta(cell.row.original.status).icon"
            :badge="getContainerStatusMeta(cell.row.original.status).badge"
            :una="TABLE_BADGE_UNA"
          />
          <NTooltip content="View item">
            <NButton
              label="i-lucide-file-input"
              icon
              btn="ghost-gray"
              size="xs"
              :to="itemUrl(cell.row.original.slug)"
            />
          </NTooltip>
        </div>
      </template>
      <template #expanded="{ row }">
        <div class="p-4 text-sm bg-muted/30 rounded-md">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <IndicatorIconText
              icon="i-lucide-key-round"
              label="Identifier"
              :value="row.original.slug"
            />
            <IndicatorIconText
              :icon="row.original.typeIcon"
              label="Type"
              :value="row.original.typeLabel"
            />
            <IndicatorIconText
              icon="i-lucide-package"
              label="Quantity"
              :value="`${row.original.quantity ?? '—'}${row.original.unit ? ` ${row.original.unit}` : ''}`"
            />
            <IndicatorIconText
              icon="i-lucide-flask-conical"
              label="Concentration"
              :value="row.original.concentration == null ? '—' : `${row.original.concentration}${row.original.concentrationUnit ? ` ${row.original.concentrationUnit}` : ''}`"
            />
            <IndicatorIconText
              icon="i-lucide-map-pin"
              label="Position"
              :value="row.original.positionLabel ?? '—'"
            />
            <IndicatorIconText
              icon="i-lucide-barcode"
              label="Barcode"
              :value="row.original.barcode ?? '—'"
            />
            <IndicatorIconText
              icon="i-lucide-hash"
              label="Lot number"
              :value="row.original.lotNumber ?? '—'"
            />
            <IndicatorIconText
              icon="i-lucide-calendar-plus"
              label="Arrival date"
              :value="row.original.arrivalDate ? formatDate(row.original.arrivalDate) : '—'"
            />
            <IndicatorIconText
              icon="i-lucide-calendar-check"
              label="Opening date"
              :value="row.original.openingDate ? formatDate(row.original.openingDate) : '—'"
            />
            <IndicatorIconText
              icon="i-lucide-calendar-x"
              label="Expiry date"
              :value="row.original.expiryDate ? formatDate(row.original.expiryDate) : '—'"
            />
          </div>
        </div>
      </template>
    </NTable>
    <div
      v-if="selectedItems.length > 0"
      class="flex flex-wrap items-center justify-between gap-4 px-2 mt-4"
    >
      <span class="flex-1 text-sm text-muted">{{ selectedItems.length }} item(s) selected.</span>
      <div class="flex flex-wrap gap-3 justify-end">
        <DialogAlterItems
          :items="selectedItems"
          @done="clearSelection"
        />
        <DialogLocateItems
          v-if="allSelectedLost"
          :items="selectedItems"
          @done="clearSelection"
        />
        <DialogMoveItems
          v-if="canMoveSelection"
          :items="selectedItems"
          @done="clearSelection"
        />
        <DialogDeleteItem
          v-if="isAdmin"
          :items="selectedItems"
          @done="clearSelection"
        />
      </div>
    </div>
  </div>
</template>
