<script setup lang="ts">
import type { ColumnDef, Row, RowSelectionState, Table } from '@tanstack/vue-table'
import type { FirnUserToken } from '~~/types/tokens'
import { formatDate } from '~/utils/dates/formatting'
import { deleteUserTokenByAdmin } from '~/utils/mutations/tokens'
import { DateTime } from 'luxon'

const props = defineProps<{
  googleId: number
  googleEmail: string
  googleGivenName: string
  googleFamilyName: string
  tokens: FirnUserToken[] | undefined
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
    accessorFn: row => row.expiresAt
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
      // expiresAt formatting is handled in the template slot
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
  const { deleteTokenByAdmin } = deleteUserTokenByAdmin()
  if (selectedRows && selectedRows.length > 0) {
    const tokenIDs = selectedRows
      .map(row => row.original.tokenID)
      .filter((tokenID): tokenID is string => tokenID !== undefined)

    if (tokenIDs.length > 0) {
      deleteTokenByAdmin({
        googleId: props.googleId,
        googleEmail: props.googleEmail,
        tokenID: tokenIDs
      })
    }
  }
}

// Helper function to get expiration status for a given date
const getExpirationStatus = (expiresAt: string) => {
  const expiryDate = DateTime.fromISO(expiresAt)
  // https://moment.github.io/luxon/#/math
  const diff = expiryDate.diff(DateTime.now(), 'days').shiftTo('days').toObject()
  
  if (diff.days && diff.days < 0) {
    return 'expired'
  }
  if (diff.days && diff.days <= 7) {
    return 'expiring-soon'
  }
  return 'valid'
}
</script>

<template>
  <NDrawer
    direction="bottom"
    scrollable
  >
    <NDrawerTrigger as-child>
      <NButton
        label="Administer tokens"
        class="transition delay-300 ease-in-out"
        btn="soft-primary hover:outline-primary"
        trailing="i-lucide-qr-code"
        :disabled="!props.tokens || props.tokens.length === 0"
      />
    </NDrawerTrigger>
    <NDrawerContent>
      <NDrawerHeader>
        <NDrawerTitle>Administer {{ props.googleGivenName }} {{ props.googleFamilyName }}'s tokens</NDrawerTitle>

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
      </NDrawerHeader>
      <div class="w-full overflow-x-auto">
        <NTable
          ref="table"
          v-model:row-selection="select"
          :columns="columns"
          :data="formattedTokens || []"
          :una="{
            tableHead: 'text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
          }"
          enable-row-selection
          empty-text="No issued tokens for this user"
          empty-icon="i-lucide-construction"
        >
          <template #expiresAt-cell="{ cell }">
            <template
              v-if="getExpirationStatus(cell.row.original.expiresAt) === 'expired'"
            >
              <NTooltip
                tooltip="gray"
                content="The token has expired"
              >
                <NKbd
                  kbd="solid-gray"
                  size="sm"
                  :label="formatDate(cell.row.original.expiresAt, {
                    relative: relativeDates,
                    includeWeekday: includeWeekday,
                    time: displayTime
                  })"
                />
              </NTooltip>
            </template>
            <template
              v-else-if="getExpirationStatus(cell.row.original.expiresAt) === 'expiring-soon'"
            >
              <NTooltip
                tooltip="primary"
                content="The token expires soon"
              >
                <NKbd
                  kbd="solid-primary"
                  size="sm"
                  :label="formatDate(cell.row.original.expiresAt, {
                    relative: relativeDates,
                    includeWeekday: includeWeekday,
                    time: displayTime
                  })"
                />
              </NTooltip>
            </template>
            <template v-else>
              {{ formatDate(cell.row.original.expiresAt, {
                relative: relativeDates,
                includeWeekday: includeWeekday,
                time: displayTime
              }) }}
            </template>
          </template>
        </NTable>
        <div
          class="flex items-center justify-between px-2"
        >
          <div
            class="flex-1 text-sm text-muted"
          >
            {{ table?.getFilteredSelectedRowModel().rows.length }} of
            {{ table?.getFilteredRowModel().rows.length }} token(s) selected.
          </div>
        </div>
      </div>
      <NDrawerFooter>
        <div class="flex flex-col gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
          <NDrawerClose as-child>
            <NButton
              label="Cancel"
              class="transition delay-300 ease-in-out"
              btn="soft-gray hover:outline-gray"
              trailing="i-lucide-x"
            />
          </NDrawerClose>
          <NButton
            :label="`Delete ${props.googleGivenName} ${props.googleFamilyName}'s ${table?.getFilteredSelectedRowModel().rows.length === 1 ? 'token' : 'tokens'}`"
            class="transition delay-300 ease-in-out"
            btn="soft-error hover:outline-error"
            trailing="i-lucide-banknote-x"
            @click="handleDeletion(table?.getFilteredSelectedRowModel().rows)"
          />
        </div>
      </NDrawerFooter>
    </NDrawerContent>
  </NDrawer>
</template>
