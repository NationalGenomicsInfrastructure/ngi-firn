import type { DisplayUserToAdmin } from '~~/types/auth'

export const getApprovedFirnUsers = async (): Promise<DisplayUserToAdmin[]> => {
  const { $trpc } = useNuxtApp()
  const res = await $trpc.users.getApprovedUsers.query()
  return res
}