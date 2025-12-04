<script setup lang="ts">
import type { ColumnDef, Row, RowSelectionState, Table } from '@tanstack/vue-table'
import type { FirnUserToken } from '~~/types/tokens'
import { formatDate, getExpirationStatus, type ExpirationStatus } from '~/utils/dates/formatting'
import { deleteFirnUserToken } from '~/utils/mutations/tokens'

// Extended type for formatted tokens with pre-computed expiration status
interface FormattedToken extends Omit<FirnUserToken, 'createdAt' | 'lastUsedAt'> {
  createdAt: string
  lastUsedAt: string
  expiresAtFormatted: string
  expirationStatus: ExpirationStatus
}

const props = defineProps<{
  tokens: FirnUserToken[] | undefined
  loading: boolean
}>()

const columns: ColumnDef<FormattedToken>[] = [
  {
    header: 'Token ID',
    accessorKey: 'tokenID',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: 'text-left text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
      }
    }
  },
  {
    header: 'Creation date',
    accessorKey: 'createdAt'
  },
  {
    header: 'Expiration date',
    accessorKey: 'expiresAtFormatted',
    id: 'expiresAt'
  },
  {
    header: 'Last used',
    accessorKey: 'lastUsedAt'
  },
  {
    header: 'Audience',
    accessorKey: 'audience'
  }
]

const pagination = ref({
  pageSize: 10,
  pageIndex: 0
})

const select = ref<RowSelectionState>()
const table = useTemplateRef<Table<FormattedToken>>('table')

// Date formatting options
const relativeDates = ref(false)
const includeWeekday = ref(false)
const displayTime = ref(false)

const formattedTokens = computed((): FormattedToken[] | undefined => {
  return props.tokens?.map((token) => {
    const formatOptions = {
      relative: relativeDates.value,
      includeWeekday: includeWeekday.value,
      time: displayTime.value
    }
    return {
      ...token,
      createdAt: formatDate(token.createdAt, formatOptions),
      lastUsedAt: formatDate(token.lastUsedAt, formatOptions),
      // Pre-compute expiration status and formatted date
      expiresAtFormatted: formatDate(token.expiresAt, formatOptions),
      expirationStatus: getExpirationStatus(token.expiresAt)
    }
  })
})

// Two watchers to monitor the date formatting options

// If relative is turned on, force others off
watch(relativeDates, (isRelative) => {
  if (!isRelative) return
  if (includeWeekday.value) includeWeekday.value = false
  if (displayTime.value) displayTime.value = false
})

// If either absolute option is turned on, force relative off
watch([includeWeekday, displayTime], ([weekday, time]) => {
  if (!(weekday || time)) return
  if (relativeDates.value) relativeDates.value = false
})

const handleDeletion = (selectedRows: Row<FormattedToken>[] | undefined) => {
  const { deleteToken } = deleteFirnUserToken()
  if (selectedRows && selectedRows.length > 0) {
    const tokenIDs = selectedRows
      .map(row => row.original.tokenID)
      .filter((tokenID): tokenID is string => tokenID !== undefined)

    if (tokenIDs.length > 0) {
      select.value = undefined // clear selection in the table
      deleteToken({
        tokenID: tokenIDs
      })
    }
  }
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <NFormGroup
      :label="relativeDates ? 'Dates: relative' : 'Dates: absolute'"
    >
      <NSwitch
        v-model="relativeDates"
      />
    </NFormGroup>
    <NFormGroup
      :label="includeWeekday ? 'Weekdays: show' : 'Weekdays: hide'"
    >
      <NSwitch
        v-model="includeWeekday"
      />
    </NFormGroup>
    <NFormGroup
      :label="displayTime ? 'Time: show' : 'Time: hide'"
    >
      <NSwitch
        v-model="displayTime"
      />
    </NFormGroup>
  </div>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:row-selection="select"
      :loading="loading"
      :columns="columns"
      :data="formattedTokens || []"
      :una="{
        tableHead: 'text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
      }"
      :default-sort="{
        id: 'expiresAt',
        desc: true
      }"
      :pagination="pagination"
      enable-row-selection
      enable-sorting
      enable-multi-sort
      empty-text="No issued tokens for your account"
      empty-icon="i-lucide-construction"
    >
      <!-- Custom cell for expiration date with status indicators -->
      <template #cell-expiresAt="{ row }">
        <template v-if="row.original.expirationStatus === 'expired'">
          <NTooltip tooltip="gray" content="The token has expired">
            <NKbd kbd="solid-gray" size="sm" :label="row.original.expiresAtFormatted" />
          </NTooltip>
        </template>
        <template v-else-if="row.original.expirationStatus === 'expiring-soon'">
          <NTooltip tooltip="primary" content="The token expires soon">
            <NKbd kbd="solid-primary" size="sm" :label="row.original.expiresAtFormatted" />
          </NTooltip>
        </template>
        <template v-else>
          {{ row.original.expiresAtFormatted }}
        </template>
      </template>
    </NTable>
    <!-- pagination -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4"
    >
      <div
        class="flex items-center justify-center text-sm font-medium"
      >
        Page {{ (table?.getState().pagination.pageIndex ?? 0) + 1 }} of
        {{ table?.getPageCount().toLocaleString() }}
      </div>

      <NPagination
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 5"
        @update:page="table?.setPageIndex($event - 1)"
      />
    </div>
    <div
      class="flex items-center justify-between px-2"
    >
      <!-- selection and deletion button -->
      <div
        class="flex-1 text-sm text-muted"
      >
        {{ table?.getFilteredSelectedRowModel().rows.length }} of
        {{ table?.getFilteredRowModel().rows.length }} token(s) selected.
      </div>
      <div class="flex gap-4 justify-end mt-4">
        <NButton
          label="Delete"
          class="transition delay-300 ease-in-out"
          btn="soft-error hover:outline-error"
          trailing="i-lucide-banknote-x"
          @click="handleDeletion(table?.getFilteredSelectedRowModel().rows)"
        />
      </div>
    </div>
  </div>
</template>
