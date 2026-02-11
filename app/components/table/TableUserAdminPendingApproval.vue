<script setup lang="ts">
import type { ColumnDef, Row, RowSelectionState, Table } from '@tanstack/vue-table'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { formatDate } from '~/utils/dates/formatting'
import { deleteUserByAdmin, setUserAccessByAdmin } from '~/utils/mutations/users'

// Extended type for formatted users with pre-computed display values
interface FormattedUser extends Omit<DisplayUserToAdmin, 'createdAt'> {
  createdAt: string
  fullName: string
}

const props = defineProps<{
  users: DisplayUserToAdmin[] | undefined
  loading: boolean
}>()

const columns: ColumnDef<FormattedUser>[] = [
  {
    header: 'Requesting account',
    accessorKey: 'fullName',
    meta: {
      una: {
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }
    }
  },
  {
    header: 'Pending since',
    accessorKey: 'createdAt'
  }
]

const select = ref<RowSelectionState>()
const table = useTemplateRef<Table<FormattedUser>>('table')

const formattedUsers = computed((): FormattedUser[] | undefined => {
  return props.users?.map((user) => {
    return {
      ...user,
      createdAt: formatDate(user.createdAt, { relative: true, includeWeekday: true, time: false }),
      fullName: `${user.googleGivenName} ${user.googleFamilyName}`
    }
  })
})

const handleRejection = (selectedRows: Row<FormattedUser>[] | undefined) => {
  const { deleteUser } = deleteUserByAdmin()
  selectedRows?.forEach((row) => {
    const user = row.original
    if (user.googleId && user.googleGivenName && user.googleFamilyName) {
      deleteUser({
        googleId: user.googleId,
        googleGivenName: user.googleGivenName,
        googleFamilyName: user.googleFamilyName
      })
    }
  })
  select.value = undefined // clear selection in the table
}

const handleApproval = (selectedRows: Row<FormattedUser>[] | undefined) => {
  const { setUserAccess } = setUserAccessByAdmin()
  selectedRows?.forEach((row) => {
    const user = row.original
    if (user.googleId && user.googleGivenName && user.googleFamilyName) {
      setUserAccess({
        googleId: user.googleId,
        googleGivenName: user.googleGivenName,
        googleFamilyName: user.googleFamilyName,
        allowLogin: true,
        isRetired: false,
        isAdmin: user.isAdmin
      })
    }
  })
  select.value = undefined // clear selection in the table
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:row-selection="select"
      :loading="loading"
      :columns="columns"
      :data="formattedUsers || []"
      :una="{
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }"
      enable-row-selection
      empty-text="No pending requests"
      empty-icon="i-lucide-user-check"
    >
      <template #fullName-cell="{ cell }">
        <div class="flex items-center">
          <NAvatar
            :src="cell.row.original.googleAvatar || undefined"
            :alt="cell.row.original.fullName"
          />
          <div class="ml-2">
            <div class="text-primary-700 dark:text-primary-400 font-semibold leading-none">
              {{ cell.row.original.fullName }}
            </div>
            <span class="text-sm text-muted">
              {{ cell.row.original.googleEmail }}
            </span>
          </div>
        </div>
      </template>
    </NTable>
    <div
      class="flex items-center justify-between px-2"
    >
      <div
        class="flex-1 text-sm text-muted"
      >
        {{ table?.getFilteredSelectedRowModel().rows.length }} of
        {{ table?.getFilteredRowModel().rows.length }} requests(s) selected.
      </div>
      <div class="flex gap-4 justify-end mt-4">
        <NButton
          label="Reject"
          class="transition delay-300 ease-in-out"
          btn="soft-error hover:outline-error"
          trailing="i-lucide-user-x"
          @click="handleRejection(table?.getFilteredSelectedRowModel().rows)"
        />
        <NButton
          label="Approve"
          leading="i-lucide-skip-forward"
          class="transition delay-300 ease-in-out"
          btn="soft-primary hover:outline-primary"
          @click="handleApproval(table?.getFilteredSelectedRowModel().rows)"
        />
      </div>
    </div>
  </div>
</template>
