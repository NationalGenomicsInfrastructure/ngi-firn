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
    accessorKey: 'googleGivenName'
  },
  {
    header: 'Last Name',
    accessorKey: 'googleFamilyName'
  },
  {
    header: 'Created',
    accessorKey: 'createdAt'
  },
  {
    header: 'Last Seen',
    accessorKey: 'lastSeenAt'
  },
  {
    header: 'Allow Login',
    accessorKey: 'allowLogin'
  },
  {
    header: 'Is Retired',
    accessorKey: 'isRetired'
  },
  {
    header: 'Is Admin',
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
    <NFormGroup :label="relativeDates ? 'Relative Dates' : 'Absolute Dates'">
      <NSwitch
        v-model="relativeDates"
      />
    </NFormGroup>
    <NFormGroup :label="includeWeekday ? 'Show Weekday' : 'Hide Weekday'">
      <NSwitch
        v-model="includeWeekday"
      />
    </NFormGroup>
    <NFormGroup :label="time ? 'Show Time' : 'Hide Time'">
      <NSwitch
        v-model="time"
      />
    </NFormGroup>
  </div>
  <div class="w-full overflow-x-auto">
    <NTable
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="formattedUsers || []"
      class="w-full"
    >
      <template #expanded="{ row }">
        <div class="p-4">
          <p class="text-sm text-muted">
            Object:
          </p>
          <p class="text-base">
            {{ row }}
          </p>
        </div>
      </template>
    </NTable>
  </div>
</template>
