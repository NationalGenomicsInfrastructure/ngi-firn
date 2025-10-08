<script setup lang="ts">
import type { CellContext, ColumnDef, Row, RowSelectionState, Table } from '@tanstack/vue-table'
import type { FirnUserToken } from '~~/types/tokens'
import { formatDate } from '~/utils/dates/formatting'
import { deleteFirnUserToken } from '~/utils/mutations/tokens'
import { DateTime } from 'luxon'
import { NKbd, NTooltip } from '#components'

const props = defineProps<{
  tokens: FirnUserToken[] | undefined
  loading: boolean
}>()

const columns: ColumnDef<FirnUserToken>[] = [
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
    accessorKey: 'expiresAt',
    accessorFn: row => row.expiresAt,
    cell: (info: CellContext<FirnUserToken, unknown>) => {
      const expiresAt = info.getValue() as string
      const expiryDate = DateTime.fromISO(expiresAt)
      // https://moment.github.io/luxon/#/math
      const diff = expiryDate.diff(DateTime.now(), 'days').shiftTo('days').toObject()

      const formattedDate = formatDate(expiresAt, {
        relative: relativeDates.value,
        includeWeekday: includeWeekday.value,
        time: displayTime.value
      })

      // Token has already expired
      if (diff.days && diff.days < 0) {
        return h(NTooltip, {
          tooltip: 'gray',
          content: 'The token has expired'
        }, {
          default: () => h(NKbd, {
            kbd: 'solid-gray',
            size: 'sm',
            label: formattedDate
          })
        })
      }

      // Token expires within 7 days
      if (diff.days && diff.days <= 7) {
        return h(NTooltip, {
          tooltip: 'primary',
          content: 'The token expires soon'
        }, {
          default: () => h(NKbd, {
            kbd: 'solid-primary',
            size: 'sm',
            label: formattedDate
          })
        })
      }

      return formattedDate
    }
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

const select = ref<RowSelectionState>()
const table = useTemplateRef<Table<FirnUserToken>>('table')

// Date formatting options
const relativeDates = ref(false)
const includeWeekday = ref(false)
const displayTime = ref(false)

const formattedTokens = computed(() => {
  return props.tokens?.map((token) => {
    return {
      ...token,
      createdAt: formatDate(token.createdAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: displayTime.value }),
      // expiresAt formatting is handled in the cell renderer
      lastUsedAt: formatDate(token.lastUsedAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: displayTime.value })
    }
  })
})

// Formatting options watcher
watch([relativeDates, includeWeekday, displayTime], () => {
  // When relativeDates is enabled, turn off includeWeekday and time.
  // When either includeWeekday or time is enabled, turn off relativeDates.
  if (relativeDates.value) {
    if (includeWeekday.value) includeWeekday.value = false
    if (displayTime.value) displayTime.value = false
  } else {
    if (includeWeekday.value && relativeDates.value) includeWeekday.value = false
    if (displayTime.value && relativeDates.value) displayTime.value = false
  }
})

const handleDeletion = (selectedRows: Row<FirnUserToken>[] | undefined) => {
  const { deleteToken } = deleteFirnUserToken()
  if (selectedRows && selectedRows.length > 0) {
    const tokenIDs = selectedRows
      .map(row => row.original.tokenID)
      .filter((tokenID): tokenID is string => tokenID !== undefined)

    if (tokenIDs.length > 0) {
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
      enable-row-selection
      empty-text="No issued tokens for your account"
      empty-icon="i-lucide-construction"
    />
    <div
      class="flex items-center justify-between px-2"
    >
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
