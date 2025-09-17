import type { DisplayUserToAdmin } from '~~/types/auth'
import { defineQueryOptions } from '@pinia/colada'

/**
 * Alternatively to directly importing the DisplayUserToAdmin type,
 * tRPC could also infer the type from the query function.
 *
 * import type { FirnRouter } from '~~/server/trpc/routers/index'
 * import type { inferRouterOutputs } from '@trpc/server'
 * type RouterOutput = inferRouterOutputs<FirnRouter>
 * type ApprovedUsers = RouterOutput['users']['getApprovedUsers']
 * type PendingUsers = RouterOutput['users']['getPendingUsers']
 * type RetiredUsers = RouterOutput['users']['getRetiredUsers']
 */

/**
 * Similarly, one could derive query keys from the query function
 * instead of hardcoding them like I have done below.
 *
 * import { getQueryKey } from 'trpc-nuxt/client'
 * const { $trpc } = useNuxtApp()
 * export const approvedUsersQueryKey = getQueryKey($trpc.users.getApprovedUsers, undefined)
 *
 * BUT: getQueryKey returns a string, while Pinia Colada expects an array for the key.
 * The reason for the array structure is, that Pinia Colada can invalidate cached queries
 * precisely, by invalidating all sub-queries of a particular key.
 * @see https://pinia-colada.esm.dev/guide/query-invalidation.html
 *
 * Therefore, hardcoding the query keys is the better option.
 */

// Key factory for users domain
export const USERS_QUERY_KEYS = {
  root: ['users'] as const,
  approved: () => [...USERS_QUERY_KEYS.root, 'approved'] as const,
  pending: () => [...USERS_QUERY_KEYS.root, 'pending'] as const,
  retired: () => [...USERS_QUERY_KEYS.root, 'retired'] as const,
  self: () => [...USERS_QUERY_KEYS.root, 'self'] as const
} as const

// Query for approved users
export const approvedUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.approved(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getApprovedUsers.query()
  }
})

// Query for pending users
export const pendingUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.pending(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getPendingUsers.query()
  }
})

// Query for retired users
export const retiredUsersQuery = defineQueryOptions<DisplayUserToAdmin[]>({
  key: USERS_QUERY_KEYS.retired(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getRetiredUsers.query()
  }
})

// Query for user information of own user
export const selfUserQuery = defineQueryOptions<DisplayUserToAdmin>({
  key: USERS_QUERY_KEYS.self(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.getUserInfoSelf.query()
  }
})
