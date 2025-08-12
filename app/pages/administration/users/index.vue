<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { approvedUsersQuery, retiredUsersQuery } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Subscribe reactively to queries
const { state: approvedUsersState, asyncStatus: approvedStatus } = useQuery(approvedUsersQuery)
const { state: retiredUsersState, asyncStatus: retiredStatus } = useQuery(retiredUsersQuery)

// Derive loading state from query statuses
const isLoading = computed(() => approvedStatus.value === 'loading' || retiredStatus.value === 'loading')

const approvedUsers = computed(() => approvedUsersState.value.status === 'success' ? approvedUsersState.value.data : undefined)
const retiredUsers = computed(() => retiredUsersState.value.status === 'success' ? retiredUsersState.value.data : undefined)
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
    <div>
      <TableUserAdminDisplay
        :users="retiredUsers"
        :loading="isLoading"
      />
    </div>
  </div>
</template>
