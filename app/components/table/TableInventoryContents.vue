<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import type { Container, InventoryItem } from '~~/types/inventory'
import { CONTAINER_TYPE_LABELS } from '~/utils/inventory/containers'
import { ITEM_CATEGORY_LABELS, ITEM_STATUS_LABELS } from '~/utils/inventory/items'

const props = defineProps<{
  entries: Array<Container | InventoryItem>
  root: { id: string, name: string }
  loading?: boolean
}>()

interface ContentRow {
  id: string
  slug: string
  isItem: boolean
  name: string
  typeLabel: string
  location: string
  status: string
  quantity: string
  route: string
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

const columns: ColumnDef<ContentRow>[] = [
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
  { header: 'Kind', accessorKey: 'typeLabel' },
  { header: 'Location', accessorKey: 'location' },
  { header: 'Status', accessorKey: 'status' },
  { header: 'Quantity', accessorKey: 'quantity' }
]

// id → display name, drawn from the descendant set plus the root itself.
// Every intermediate container beneath the root is in `entries`, so each
// location ancestor within scope resolves to a name here.
const nameMap = computed(() => {
  const map = new Map<string, string>()
  map.set(props.root.id, props.root.name)
  for (const entry of props.entries) {
    map.set(entry._id, entry.name)
  }
  return map
})

function locationLabel(entry: Container | InventoryItem): string {
  const path = entry.locationPath ?? []
  const rootIndex = path.findIndex(ancestor => ancestor.id === props.root.id)
  const scoped = rootIndex >= 0 ? path.slice(rootIndex) : path
  const names = scoped
    .map(ancestor => nameMap.value.get(ancestor.id))
    .filter((name): name is string => Boolean(name))
  return names.length > 0 ? names.join(' › ') : props.root.name
}

const tableData = computed((): ContentRow[] => {
  return props.entries.map((entry) => {
    const isItem = entry.type === 'inventoryItem'
    if (isItem) {
      const item = entry as InventoryItem
      return {
        id: item._id,
        slug: item.slug,
        isItem: true,
        name: item.name,
        typeLabel: ITEM_CATEGORY_LABELS[item.category] ?? item.category,
        location: locationLabel(item),
        status: ITEM_STATUS_LABELS[item.status] ?? item.status,
        quantity: item.quantity == null ? '—' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`,
        route: `/inventory/items/${encodeURIComponent(item.slug)}`
      }
    }
    const container = entry as Container
    return {
      id: container._id,
      slug: container.slug,
      isItem: false,
      name: container.name,
      typeLabel: CONTAINER_TYPE_LABELS[container.containerType] ?? container.containerType,
      location: locationLabel(container),
      status: '—',
      quantity: '—',
      route: `/inventory/containers/${encodeURIComponent(container.slug)}`
    }
  })
})

const pagination = ref({ pageSize: 20, pageIndex: 0 })
const table = useTemplateRef<Table<ContentRow>>('table')
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      :loading="loading"
      :columns="columns"
      :data="tableData"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      :pagination="pagination"
      enable-sorting
      enable-multi-sort
      empty-text="Nothing stored here yet"
      empty-icon="i-lucide-package-open"
    >
      <template #name-cell="{ cell }">
        <NuxtLink
          :to="cell.row.original.route"
          class="text-primary-400 dark:text-primary-600 hover:underline"
        >
          {{ cell.row.original.name }}
        </NuxtLink>
      </template>

      <template #typeLabel-cell="{ cell }">
        <div class="flex items-center gap-2">
          <NBadge
            :label="cell.row.original.isItem ? 'Item' : 'Container'"
            :badge="cell.row.original.isItem ? 'soft-gray' : 'soft-primary'"
          />
          <span>{{ cell.row.original.typeLabel }}</span>
        </div>
      </template>

      <template #status-cell="{ cell }">
        <NBadge
          v-if="cell.row.original.isItem"
          :label="cell.row.original.status"
          :badge="cell.row.original.status === 'Available' ? 'solid-success' : 'solid-gray'"
        />
        <span
          v-else
          class="text-muted"
        >—</span>
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
