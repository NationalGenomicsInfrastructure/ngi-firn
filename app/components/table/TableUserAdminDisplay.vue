<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { formatDate } from '~/utils/dates/formatting'

const props = defineProps<{
  users: DisplayUserToAdmin[] | undefined
  loading: boolean
}>()

const pagination = ref({
  pageSize: 10,
  pageIndex: 0
})

const table = useTemplateRef<Table<DisplayUserToAdmin>>('table')

const columns: ColumnDef<DisplayUserToAdmin>[] = [
  {
    header: 'First Name',
    accessorKey: 'googleGivenName',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }
    }
  },
  {
    header: 'Last Name',
    accessorKey: 'googleFamilyName',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }
    }
  },
  {
    header: 'E-Mail',
    accessorKey: 'googleEmail'
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
    header: 'Administrator privileges',
    accessorKey: 'isAdmin'
  }
]

const expanded = ref<Record<string, boolean>>({})

// Date formatting options
const relativeDates = ref(false)
const includeWeekday = ref(false)
const displayTime = ref(false)

const formattedUsers = computed(() => {
  return props.users?.map((user) => {
    return {
      ...user,
      createdAt: formatDate(user.createdAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: displayTime.value }),
      lastSeenAt: formatDate(user.lastSeenAt, { relative: relativeDates.value, includeWeekday: includeWeekday.value, time: displayTime.value })
    }
  })
})

// Watch for date formatting options changes
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
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <NFormGroup
      :label="relativeDates ? 'Dates: relative' : 'Dates: absolute'"
      :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
    >
      <NSwitch
        v-model="relativeDates"
      />
    </NFormGroup>
    <NFormGroup
      :label="includeWeekday ? 'Weekdays: show' : 'Weekdays: hide'"
      :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
    >
      <NSwitch
        v-model="includeWeekday"
      />
    </NFormGroup>
    <NFormGroup
      :label="displayTime ? 'Time: show' : 'Time: hide'"
      :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
    >
      <NSwitch
        v-model="displayTime"
      />
    </NFormGroup>
  </div>
  <div class="w-full overflow-x-auto">
    <NTable
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :pagination="pagination"
      :data="formattedUsers || []"
      :una="{
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }"
      empty-text="No users"
      empty-icon="i-lucide-user-search"
      enable-sorting
      enable-multi-sort
    >
      <template #isAdmin-cell="{ cell }">
        <NBadge
          :una="{
            badgeDefaultVariant: cell.row.original.isAdmin ? 'badge-soft' : 'badge-soft-gray' }"
          class="capitalize"
          :label="cell.row.original.isAdmin ? 'Administrator' : 'User'"
        />
      </template>

      <template #expanded="{ row }">
        <div class="p-3 flex flex-col sm:flex-row items-start gap-4">
          <div class="flex flex-col items-center gap-2 flex-shrink-0">
            <NAvatarGroup :max="2">
              <NAvatar
                :src="row.original.googleAvatar"
                :alt="row.original.googleName"
                size="sm:lg md:xl lg:2xl"
                avatar="solid-primary"
              >
                <template #fallback>
                  <span class="text-primary-200 dark:text-primary-100 font-extrabold"><NIcon
                    name="i-lucide-snowflake"
                    class="w-8 h-8"
                  />F</span>
                </template>
              </NAvatar>
              <NAvatar
                v-if="row.original.githubAvatar"
                :src="row.original.githubAvatar"
                :alt="row.original.githubName"
                size="sm:xl md:2xl lg:3xl"
                avatar="solid-primary"
              />
            </NAvatarGroup>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-sm flex-1 ml-10">
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-snowflake"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Firn ID</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.firnId ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-fingerprint"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Google ID</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.googleId ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-mail"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Google E-Mail</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.googleEmail ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-github"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">GitHub ID</span>
              </div>
              <p class="font-medium pl-5">
                <NLink
                  :to="row.original.githubUrl"
                  :label="row.original.githubId ?? 'GitHub not linked'"
                  :disabled="!row.original.githubUrl"
                  active-class="text-primary"
                  external
                />
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-key-round"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Tokens</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.tokens ? row.original.tokens.length : 0 }}
              </p>
            </div>
          </div>

          <div class="flex flex-col items-end flex-shrink-0 gap-2">
            <DialogSetUserPermissions
              v-model:allow-login="row.original.allowLogin"
              v-model:is-retired="row.original.isRetired"
              v-model:is-admin="row.original.isAdmin"
              :google-id="row.original.googleId"
              :google-given-name="row.original.googleGivenName"
              :google-family-name="row.original.googleFamilyName"
            />
            <DrawerAdminTokens
              :tokens="row.original.tokens"
              :google-id="row.original.googleId"
              :google-email="row.original.googleEmail"
              :google-given-name="row.original.googleGivenName"
              :google-family-name="row.original.googleFamilyName"
            />
            <DialogDeleteUser
              :google-id="row.original.googleId"
              :google-given-name="row.original.googleGivenName"
              :google-family-name="row.original.googleFamilyName"
            />
          </div>
        </div>
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
  </div>
</template>
