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
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="formattedUsers || []"
      :una="{
        tableHead: 'text-left bg-primary-700/20 dark:bg-primary-900 border-b-2 border-primary-700 dark:border-primary-400 text-primary-700 dark:text-primary-400'
      }"
      empty-text="No users"
      empty-icon="i-lucide-user-search"
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
        <div class="p-2 flex flex-row items-start gap-4">
          <!-- Column 1: Avatars and badges -->
          <div class="flex flex-col items-center gap-2 flex-shrink-0">
            <NAvatarGroup :max="2">
              <NAvatar
                v-if="row.original.googleAvatar"
                :src="row.original.googleAvatar"
                :alt="row.original.googleName"
              />
              <NAvatar
                v-if="row.original.githubAvatar"
                :src="row.original.githubAvatar"
                :alt="row.original.githubName"
              />
            </NAvatarGroup>
          </div>

          <!-- Column 2: Textual information -->
          <div class="flex flex-col gap-2 text-sm flex-1">
            <div>
              <span class="font-semibold mr-2">Firn ID:</span>
              <span> {{ row.original.firnId ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Google ID:</span>
              <span> {{ row.original.googleId ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Google E-Mail:</span>
              <span> {{ row.original.googleEmail ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">GitHub ID:</span>
              <NLink
                :to="row.original.githubUrl"
                :label="row.original.githubId ?? 'GitHub not linked'"
                :disabled="!row.original.githubUrl"
                active-class="text-primary"
                external
              />
            </div>
            <div>
              <span class="font-semibold mr-2">Tokens:</span>
              <span> {{ row.original.tokens ? row.original.tokens.length : 0 }}</span>
            </div>
          </div>

          <!-- Column 3: Button -->
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
  </div>
</template>
