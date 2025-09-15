<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { selfUserQuery } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Subscribe reactively to queries
const { state: selfUserState, asyncStatus: selfStatus } = useQuery(selfUserQuery)

// Derive loading state from query statuses
const isLoading = computed(() => selfStatus.value === 'loading')
const selfUser = computed(() => selfUserState.value.status === 'success' ? selfUserState.value.data : undefined)
</script>

<template>
    <div>
      <PageTitle
        title="Tokens"
        description="Manage your access tokens."
      />
      <PageHeadline
        section="Your tokens"
      />
      {{ selfUser }}
  </div>
</template>
