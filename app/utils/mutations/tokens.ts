import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { GenerateFirnUserTokenInput, DeleteFirnUserTokenInput, ValidateFirnUserTokenInput, DeleteUserTokenByAdminInput } from '~~/schemas/tokens'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { USERS_QUERY_KEYS } from '~/utils/queries/users'

// Notifications
const { showSuccess, showError } = useFirnToast()

// Mutation for generating a Firn user token

export const generateFirnUserToken = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: GenerateFirnUserTokenInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tokens.generateFirnUserToken.mutate(input)
    },
    onMutate() {
        const queryCache = useQueryCache()
        const self_user = queryCache.getQueryData<DisplayUserToAdmin>(USERS_QUERY_KEYS.self()) || undefined
        return { self_user }
      },
    onError(error: Error, input: GenerateFirnUserTokenInput, context: { self_user?: DisplayUserToAdmin | undefined }) {
      const queryCache = useQueryCache()
      if (context.self_user) {
        queryCache.setQueryData(USERS_QUERY_KEYS.self(), context.self_user)
      }
      else {
        queryCache.setQueryData(USERS_QUERY_KEYS.self(), undefined)
      }
      showError(error.message, 'Token could not be generated.')
    },
    onSuccess(response, input: GenerateFirnUserTokenInput) {
      const queryCache = useQueryCache()
      queryCache.cancelQueries({ key: USERS_QUERY_KEYS.self(), exact: true })
      queryCache.setQueryData(USERS_QUERY_KEYS.self(), response?.user || undefined)
      queryCache.setQueryData(USERS_QUERY_KEYS.token(), response?.jwt || undefined)
      showSuccess(`A new token for ${response?.user?.googleGivenName} ${response?.user?.googleFamilyName} was successfully issued.`, 'New token created')
    }
  })
  return { generateToken: mutate, ...mutation }
})

// Mutation for deleting a Firn user token

export const deleteFirnUserToken = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteFirnUserTokenInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tokens.deleteFirnUserToken.mutate(input)
    },
    onMutate() {
        const queryCache = useQueryCache()
        const self_user = queryCache.getQueryData<DisplayUserToAdmin>(USERS_QUERY_KEYS.self()) || undefined
        return { self_user }
      },
    onError(error: Error, input: DeleteFirnUserTokenInput, context: { self_user?: DisplayUserToAdmin | undefined }) {
      const queryCache = useQueryCache()
      if (context.self_user) {
        queryCache.setQueryData(USERS_QUERY_KEYS.self(), context.self_user)
      }
      else {
        queryCache.setQueryData(USERS_QUERY_KEYS.self(), undefined)
      }
      showError(error.message, 'Your token could not be deleted.')
    },
    onSuccess(response, input: DeleteFirnUserTokenInput) {
      const queryCache = useQueryCache()
      queryCache.cancelQueries({ key: USERS_QUERY_KEYS.self(), exact: true })
      queryCache.setQueryData(USERS_QUERY_KEYS.self(), response || undefined)
      showSuccess(`Your token ${input.tokenID} for user ${response?.googleGivenName} ${response?.googleFamilyName} was successfully deleted.`, 'Token deleted')
    }
  })
  return { deleteToken: mutate, ...mutation }
})

// Mutation for validating a Firn user token

export const validateFirnUserToken = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: ValidateFirnUserTokenInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tokens.validateFirnUserToken.mutate(input)
    },
    onError(error: Error, input: ValidateFirnUserTokenInput) {
      showError(error.message, 'Token could not be validated.')
    },
    onSuccess(response, input: ValidateFirnUserTokenInput) {
      showSuccess('Token validated successfully.', 'Token validated')
    }
  })
  return { validateToken: mutate, ...mutation }
})

// Mutation for deleting a user token by an admin

export const deleteUserTokenByAdmin = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteUserTokenByAdminInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tokens.deleteUserTokenByAdmin.mutate(input)
    },
    onError(error: Error, input: DeleteUserTokenByAdminInput) {
      showError(error.message, 'Token could not be deleted by admin.')
    },
    onSuccess(response, input: DeleteUserTokenByAdminInput) {
      showSuccess('Token deleted by admin successfully.', 'Token deleted by admin')
    }
  })
  return { deleteTokenByAdmin: mutate, ...mutation }
})
