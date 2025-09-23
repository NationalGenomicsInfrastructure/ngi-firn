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
    <slot name="tokens">
      <NTabs default-value="list">
        <NTabsList class="mx-auto">
          <NTabsTrigger value="list">
            <NIcon name="i-lucide-app-window" />
            List your tokens
          </NTabsTrigger>
          <NTabsTrigger value="generate">
            <NIcon name="i-lucide-diamond-plus" />
            Generate a new token
          </NTabsTrigger>
        </NTabsList>
        <NTabsContent value="list">
          <PageHeadline
            section="Your current tokens"
            class="mb-4"
          />
          <TableUserTokens
            :tokens="selfUser?.tokens"
            :loading="isLoading"
          />
        </NTabsContent>
        <NTabsContent value="generate">
          <PageHeadline
            section="Generate a new token"
            class="mb-4"
          />
          <StepperTokenGeneration />
        </NTabsContent>
      </NTabs>
    </slot>
  </div>
</template>
