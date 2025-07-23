<script setup lang="ts">
import type { DisplayUserToAdmin } from '~~/types/auth'
import { useQuery as useQueryColada, useQueryCache as useQueryCacheColada } from '@pinia/colada'

definePageMeta({
  layout: 'private'
})

// User session
const { user, session } = useUserSession()

// Notifications
const { toast } = useToast()

// tRPC
const { $trpc } = useNuxtApp()

// Form data
const newFirnUser = ref('')

// Query cache
const queryCache = useQueryCacheColada()

const getApprovedFirnUsers = async () => {
  const res = await $trpc.users.getApprovedUsers.useQuery()
  return res.data
}

const {
  state,
  asyncStatus,
  refresh,
  refetch,
} = useQueryColada<DisplayUserToAdmin[]>({
  key: ['approvedFirnUsers'],
  query: getApprovedFirnUsers,
})

</script>

<template>
  <div>
    <h1>Administration</h1>
    
    <!-- Debug output for pending users query -->

    <div v-if="asyncStatus === 'loading'">
      Loading...
    </div>
    <div v-else-if="state.status === 'error'">
      Oops, an error happened...
    </div>
    <div v-else-if="state.data">
      <pre>{{ state.data }}</pre>
    </div>
    

  </div>
</template>
