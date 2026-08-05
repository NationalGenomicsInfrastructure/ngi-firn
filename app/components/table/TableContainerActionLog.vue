<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayInventoryActionLogEntry, InventoryActionChangeRecord, SerializedUserRef } from '~~/types/inventory'
import type { InventoryActionType, InventoryFlagType } from '~~/schemas/inventory/metadata'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'
import { formatDate } from '~/utils/dates/formatting'
import { containerActionLogQuery } from '~/utils/queries/inventory/containers'

const props = withDefaults(defineProps<{
  /* The recent slice of the action log, passed from the parent DisplayContainer. */
  entries: DisplayInventoryActionLogEntry[]
  /* Container slug — used to fetch the full log on demand. */
  slug: string
  loading?: boolean
  /*
   * The server-side cap on recentActionLog (RECENT_LOG_ENTRIES). When the passed slice
   * is shorter than this, the full log is assumed already complete and the
   * "Load older entries" button is hidden.
   */
  recentCap?: number
}>(), {
  loading: false,
  recentCap: 10
})

interface ActionLogRow {
  actionType: InventoryActionType
  actionLabel: string
  user: SerializedUserRef
  userName: string
  timestamp: string
  flag: InventoryFlagType | null
  notes: string | null
  changes: InventoryActionChangeRecord[]
  linkedTaskId: string | null
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

// Gate the full-log fetch: only runs after the user clicks "Load older entries".
const showFullLog = ref(false)
const { state: fullLogState, asyncStatus: fullLogStatus } = useQueryColada(() => ({
  ...containerActionLogQuery(props.slug),
  enabled: showFullLog.value
}))

const fullLogLoaded = computed(() => showFullLog.value && fullLogState.value.status === 'success')

// Source entries: full log once loaded, otherwise the recent slice from the prop.
const sourceEntries = computed<DisplayInventoryActionLogEntry[]>(() =>
  fullLogLoaded.value ? (fullLogState.value.data ?? []) : props.entries
)

// Newest first.
const tableData = computed((): ActionLogRow[] =>
  [...sourceEntries.value]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
    .map(entry => ({
      actionType: entry.actionType,
      actionLabel: getActionTypeMeta(entry.actionType).label,
      user: entry.firnUser,
      userName: entry.firnUser.name,
      timestamp: entry.timestamp,
      flag: entry.flag ?? null,
      notes: entry.notes ?? null,
      changes: entry.changes ?? [],
      linkedTaskId: entry.linkedTaskId ?? null
    }))
)

const columns: ColumnDef<ActionLogRow>[] = [
  {
    header: 'Action',
    accessorKey: 'actionLabel',
    meta: { una: { tableHead: TABLE_HEAD_STYLE, tableCell: 'align-top' } }
  },
  {
    header: 'User',
    accessorKey: 'userName',
    meta: { una: { tableHead: TABLE_HEAD_STYLE, tableCell: 'align-top' } }
  },
  {
    header: 'When',
    accessorKey: 'timestamp',
    meta: { una: { tableHead: TABLE_HEAD_STYLE, tableCell: 'align-top' } }
  },
  {
    header: 'Flag',
    accessorKey: 'flag',
    meta: { una: { tableHead: TABLE_HEAD_STYLE, tableCell: 'align-top' } }
  }
]

const pagination = ref({ pageSize: 10, pageIndex: 0 })
const expanded = ref<Record<string, boolean>>({})
const table = useTemplateRef<Table<ActionLogRow>>('table')

// Show the button only while the recent slice may be truncated and the full log is not yet loaded.
const canLoadOlder = computed(() =>
  !fullLogLoaded.value && props.entries.length >= props.recentCap
)

function loadOlderEntries() {
  showFullLog.value = true
}

function rowHasDetails(row: ActionLogRow): boolean {
  return !!row.notes || !!row.flag || row.changes.length > 0 || !!row.linkedTaskId
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="tableData"
      :pagination="pagination"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      enable-sorting
      empty-text="No logged actions yet"
      empty-icon="i-lucide-history"
    >
      <template #actionLabel-cell="{ cell }">
        <BadgesInventoryAction :action-type="cell.row.original.actionType" />
      </template>

      <template #userName-cell="{ cell }">
        <IndicatorUserAvatar
          :user="cell.row.original.user"
          size="2"
        />
      </template>

      <template #timestamp-cell="{ cell }">
        <NTooltip :content="formatDate(cell.row.original.timestamp, { time: true, includeWeekday: true })">
          <span class="text-sm text-muted whitespace-nowrap">
            {{ formatDate(cell.row.original.timestamp, { relative: true }) }}
          </span>
        </NTooltip>
      </template>

      <template #flag-cell="{ cell }">
        <BadgesInventoryFlag
          v-if="cell.row.original.flag"
          :flag="cell.row.original.flag"
        />
        <span
          v-else
          class="text-muted"
        >—</span>
      </template>

      <template #expanded="{ row }">
        <div class="-m-4 p-4 border-l-18 border-primary-700 dark:border-primary-900">
          <div class="p-4 text-sm bg-muted/30 rounded-md">
            <div
              v-if="!rowHasDetails(row.original)"
              class="text-muted"
            >
              No additional details for this action.
            </div>

            <template v-else>
              <template v-if="row.original.notes">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <NIcon
                    name="i-lucide-message-square"
                    class="text-primary-400 dark:text-primary-600 text-xs"
                  />
                  <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Notes</span>
                </div>
                <p class="font-medium pl-5">
                  {{ row.original.notes }}
                </p>
              </template>

              <template v-if="row.original.flag">
                <NSeparator class="my-4" />
                <div class="flex items-center gap-2">
                  <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Flag</span>
                  <BadgesInventoryFlag :flag="row.original.flag" />
                </div>
              </template>

              <template v-if="row.original.changes.length">
                <NSeparator class="my-4" />
                <div class="flex items-center gap-2 mb-3">
                  <NIcon
                    name="i-lucide-clipboard-list"
                    class="text-muted"
                  />
                  <h4 class="text-sm font-semibold">
                    Changes
                  </h4>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <InventoryChangeRecord
                    v-for="(change, index) in row.original.changes"
                    :key="`${change.field}-${index}`"
                    :change="change"
                  />
                </div>
              </template>

              <template v-if="row.original.linkedTaskId">
                <NSeparator class="my-4" />
                <div class="flex items-center gap-1.5">
                  <NIcon
                    name="i-lucide-link"
                    class="text-primary-400 dark:text-primary-600 text-xs"
                  />
                  <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Linked task</span>
                  <NBadge
                    badge="outline"
                    :label="row.original.linkedTaskId"
                  />
                </div>
              </template>
            </template>
          </div>
        </div>
      </template>
    </NTable>

    <div class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4">
      <div class="flex items-center gap-4">
        <NButton
          v-if="canLoadOlder"
          label="Load older entries"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-history"
          size="sm"
          :loading="fullLogStatus === 'loading'"
          @click="loadOlderEntries()"
        />
        <span
          v-if="(table?.getFilteredRowModel().rows.length ?? 0) > 10"
          class="text-sm font-medium"
        >
          Page {{ (table?.getState().pagination.pageIndex ?? 0) + 1 }} of
          {{ table?.getPageCount().toLocaleString() }}
        </span>
      </div>

      <NPagination
        v-if="(table?.getFilteredRowModel().rows.length ?? 0) > 10"
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 10"
        @update:page="table?.setPageIndex($event - 1)"
      />
    </div>
  </div>
</template>
