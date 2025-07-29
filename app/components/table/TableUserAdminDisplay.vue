<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { formatDate } from '~/utils/dates/formatting'

const props = defineProps<{
  users: DisplayUserToAdmin[] | undefined
  loading: boolean
}>()

const columns: ColumnDef<DisplayUserToAdmin>[] = [
  {
    header: 'First Name',
    accessorKey: 'googleGivenName',
    meta: {
      una: {
        tableCell: 'text-primary-600 dark:text-primary-700 font-semibold',
        tableHead: 'text-left bg-primary-700 border-b-2 border-primary-300 dark:border-primary-500 dark:bg-primary-700 text-primary-100 dark:text-primary-400',
      },
    }
  },
  {
    header: 'Last Name',
    accessorKey: 'googleFamilyName',
    meta: {
      una: {
        tableCell: 'text-primary-600 dark:text-primary-700 font-semibold',
        tableHead: 'text-left bg-primary-700 border-b-2 border-primary-300 dark:border-primary-500 dark:bg-primary-700 text-primary-100 dark:text-primary-400',
      },
    }
  },
  {
    header: 'Created',
    accessorKey: 'createdAt'
  },
  {
    header: 'Last seen',
    accessorKey: 'lastSeenAt'
  },
  {
    header: 'Login permitted',
    accessorKey: 'allowLogin'
  },
  {
    header: 'Retired',
    accessorKey: 'isRetired'
  },
  {
    header: 'Admin',
    accessorKey: 'isAdmin'
  }
]

const expanded = ref<Record<string, boolean>>({})

// Date formatting options
const relativeDates = ref(false)
const includeWeekday = ref(false)
const time = ref(false)

const formattedUsers = computed(() => {
  return props.users?.map((user) => {
    return {
      ...user,
      createdAt: formatDate(user.createdAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: time.value }),
      lastSeenAt: formatDate(user.lastSeenAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: time.value })
    }
  })
}) 

// Watch for date formatting options changes
watch([relativeDates, includeWeekday, time], () => {
  // When relativeDates is enabled, turn off includeWeekday and time.
  // When either includeWeekday or time is enabled, turn off relativeDates.
  if (relativeDates.value) {
    if (includeWeekday.value) includeWeekday.value = false
    if (time.value) time.value = false
  } else if (includeWeekday.value || time.value) {
    if (relativeDates.value) relativeDates.value = false
  }
})
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <NFormField :label="relativeDates ? 'Relative Dates' : 'Absolute Dates'" name="relativeDates">
      <NSwitch
        v-model="relativeDates"
      />
    </NFormField>
    <NFormField :label="includeWeekday ? 'Show Weekday' : 'Hide Weekday'" name="includeWeekday">
      <NSwitch
        v-model="includeWeekday"
      />
    </NFormField>
    <NFormField :label="time ? 'Show Time' : 'Hide Time'" name="time">
      <NSwitch
        v-model="time"
      />
    </NFormField>
  </div>
  <div class="w-full overflow-x-auto">
    <NTable
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="formattedUsers || []"
      :una="{
        tableHead: 'text-left bg-primary-700 border-b-2 border-primary-300 dark:border-primary-500 dark:bg-primary-700 text-primary-100 dark:text-primary-400',
    }"
    >
      <template #expanded="{ row }">
        <div class="p-2 flex flex-col items-center gap-2">
          <NAvatarGroup :max="2">
            <NAvatar v-if="row.original.googleAvatar" :src="row.original.googleAvatar" :alt="row.original.googleName" />
            <NAvatar v-if="row.original.githubAvatar" :src="row.original.githubAvatar" :alt="row.original.githubName" />
          </NAvatarGroup>
          <div class="flex flex-wrap gap-2 justify-center">
            <NBadge badge="solid" label="Administrator" v-if="row.original.isAdmin" />
            <NBadge badge="outline" label="Retired" v-if="row.original.isRetired" />
          </div>
        </div>
      </template>
    </NTable>
  </div>
</template>
