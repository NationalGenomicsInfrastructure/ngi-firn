<script setup lang="ts">
import type { ColumnDef, Row, RowSelectionState, Table } from '@tanstack/vue-table'
import type { FirnUserToken } from '~~/types/tokens'
import { formatDate } from '~/utils/dates/formatting'
import { deleteFirnUserToken } from '~/utils/mutations/tokens'

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
    header: 'Created at',
    accessorKey: 'createdAt'
  },
  {
    header: 'Expires at',
    accessorKey: 'expiresAt'
  },
  {
    header: 'Last used at',
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
      expiresAt: formatDate(token.expiresAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: displayTime.value }),
      lastUsedAt: formatDate(token.lastUsedAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: displayTime.value })
    }
  })
})

// Watch for date formatting options changes
watch([relativeDates, includeWeekday, displayTime], () => {
  // When relativeDates is enabled, turn off includeWeekday and time.
  // When either includeWeekday or time is enabled, turn off relativeDates.
  if (relativeDates.value) {
    if (includeWeekday.value) includeWeekday.value = false
    if (displayTime.value) displayTime.value = false
  }
  else if (includeWeekday.value || displayTime.value) {
    if (relativeDates.value) relativeDates.value = false
  }
})

const handleDeletion = (selectedRows: Row<FirnUserToken>[] | undefined) => {
  const { deleteToken } = deleteFirnUserToken()
  selectedRows?.forEach((row) => {
    const token = row.original
    if (token.tokenID) {
      deleteToken({
        tokenID: token.tokenID
      })
    }
  })
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
