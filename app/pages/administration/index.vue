<script setup lang="ts">

import { useQuery as useQueryColada, useQueryCache as useQueryCacheColada } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { getApprovedFirnUsers } from '~/utils/users/apiUsers'

definePageMeta({
  layout: 'private'
})

// User session
const { user, session } = useUserSession()

// Notifications
const { toast } = useToast()



// Form data
const newFirnUser = ref('')

// Query cache
const queryCache = useQueryCacheColada()

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
