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
    header: 'First Name',
    accessorKey: 'googleGivenName',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: 'text-left text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
      }
    }
  },
  {
    header: 'Last Name',
    accessorKey: 'googleFamilyName',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: 'text-left text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
      }
    }
  },
  {
    header: 'Requesting account',
    accessorKey: 'fullName',
    id: 'user'
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
        tableHead: 'text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
      }"
      enable-row-selection
      empty-text="No pending requests"
      empty-icon="i-lucide-user-check"
    >
      <!-- Custom cell for user with avatar and email -->
      <template #cell-user="{ row }">
        <div class="flex items-center">
          <NAvatar
            :src="row.original.googleAvatar || undefined"
            :alt="row.original.fullName"
          />
          <div class="ml-2">
            <div class="text-sm font-semibold leading-none">
              {{ row.original.fullName }}
            </div>
            <span class="text-sm text-muted">
              {{ row.original.googleEmail }}
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
