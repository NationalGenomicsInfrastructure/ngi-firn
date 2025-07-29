import type { DisplayUserToAdmin } from '~~/types/auth'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for users domain
export const USERS_QUERY_KEYS = {
  root: ['users'] as const,
  approved: () => [...USERS_QUERY_KEYS.root, 'approved'] as const,
  pending: () => [...USERS_QUERY_KEYS.root, 'pending'] as const,
  retired: () => [...USERS_QUERY_KEYS.root, 'retired'] as const,
} as const

// Query for approved users
export const approvedUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.approved(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getApprovedUsers.query()
  },
})

// Query for pending users
export const pendingUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.pending(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getPendingUsers.query()
  },
})

// Query for retired users
export const retiredUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.retired(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getRetiredUsers.query()
  },
})
