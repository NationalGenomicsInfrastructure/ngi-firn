import { defineMutation } from '@pinia/colada'
import type { CreateUserByAdminInput, SetUserAccessByAdminInput } from '~~/schemas/users'

// Mutation for creating a user by an admin
export const createUserByAdmin = defineMutation({
    mutation: async (input: CreateUserByAdminInput) => {
    const { $trpc } = useNuxtApp()
    return await $trpc.users.createUserByAdmin.mutate(input)
    }
})

// Mutation for updating user access by an admin
export const setUserAccessByAdmin = defineMutation({
    mutation: async (input: SetUserAccessByAdminInput) => {
    const { $trpc } = useNuxtApp()
    return await $trpc.users.setUserAccessByAdmin.mutate(input)
    }
})
