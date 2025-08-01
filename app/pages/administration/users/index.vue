<script setup lang="ts">
import { useQueryCache } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { approvedUsersQuery, retiredUsersQuery, USERS_QUERY_KEYS } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Notifications
const { toast } = useToast()

// Query cache
const queryCache = useQueryCache()

// Loading state
const isLoading = ref(true)

// Wrap cache requests in a function that manages loading state
const loadUserData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      queryCache.refresh(queryCache.ensure(approvedUsersQuery)),
      queryCache.refresh(queryCache.ensure(retiredUsersQuery))
    ])
  }
  finally {
    isLoading.value = false
  }
}

// Load data on component mount
await loadUserData()

const approvedUsers = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved())
const retiredUsers = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.retired())
</script>

<template>
  <div>
    <PageTitle
      title="User overview"
      description="Manage our users and their permissions."
    />
    <PageHeadline
      section="Active users"
    />
    <div>
      <TableUserAdminDisplay
        :users="approvedUsers"
        :loading="isLoading"
      />
    </div>
    <PageHeadline
      section="Inactive users"
    />
    {{ retiredUsers }}
    <div>
      <TableUserAdminDisplay
        :users="retiredUsers"
        :loading="isLoading"
      />
    </div>
  </div>
</template>
