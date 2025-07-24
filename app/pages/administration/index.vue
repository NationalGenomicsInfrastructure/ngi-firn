<script setup lang="ts">

import { useQuery, useQueryCache } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { approvedUsersQuery, pendingUsersQuery, retiredUsersQuery, USERS_QUERY_KEYS } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Notifications
const { toast } = useToast()

// Query cache
const queryCache = useQueryCache()

const { state, asyncStatus} = useQuery(approvedUsersQuery)
const {} = useQuery(pendingUsersQuery)
const {} = useQuery(retiredUsersQuery)

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
    <div>
      <pre>{{ queryCache.getQueryData(USERS_QUERY_KEYS.pending()) }}</pre>
    </div>
  </div>
</template>
