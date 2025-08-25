<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { pendingUsersQuery } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Subscribe reactively to queries
const { state: pendingUsersState, asyncStatus: pendingStatus } = useQuery(pendingUsersQuery)

// Derive loading state from query statuses
const isLoading = computed(() => pendingStatus.value === 'loading')
const pendingUsers = computed(() => pendingUsersState.value.status === 'success' ? pendingUsersState.value.data : undefined)
</script>

<template>
  <div>
    <PageTitle
      title="Add user"
      description="Add a new user to the system."
    />
    <div class="grid w-full grid-cols-2 md:grid-cols-3 gap-4">
      <div class="col-span-2 space-y-4 mr-4">
        <PageHeadline
          section="Pending users"
        />
        <p class="text-muted mb-4">
          Approve users who self-requested access to the system.
        </p>
        <TableUserAdminPendingApproval
          :users="pendingUsers"
          :loading="isLoading"
        />
      </div>
      <NCard
        title="Invite a new user to Firn"
        description="Users with a SciLifeLab Google account can be invited to Firn and will directly be approved to login to the system"
        card="outline"
        :una="{
          cardTitle: 'text-center scroll-m-20 font-semibold text-primary-700 dark:text-primary-400 text-lg lg:text-xl',
          cardContent: 'space-y-4',
          cardDescription: 'text-muted'
        }"
      >
        <FormUserAdminInvite />
      </NCard>
    </div>
  </div>
</template>
