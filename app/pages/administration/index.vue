<script setup lang="ts">

import { useQueryCache } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { approvedUsersQuery, pendingUsersQuery, retiredUsersQuery, USERS_QUERY_KEYS } from '~/utils/queries/users'

definePageMeta({
  layout: 'private'
})

// Notifications
const { toast } = useToast()

// Query cache
const queryCache = useQueryCache()

await queryCache.refresh(queryCache.ensure(approvedUsersQuery))
queryCache.refresh(queryCache.ensure(pendingUsersQuery))
queryCache.refresh(queryCache.ensure(retiredUsersQuery))

const approvedUsers = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved())
const pendingUsers = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.pending())
const retiredUsers = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.retired())

</script>

<template>
  <div>
    <h1>Administration</h1>
    
    <!-- Debug output for pending users query -->

    <div>
      <pre>{{ approvedUsers }}</pre>
    </div>
  </div>
</template>
