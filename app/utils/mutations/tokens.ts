import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { GenerateFirnUserTokenInput, DeleteFirnUserTokenInput, ValidateFirnUserTokenInput, DeleteUserTokenByAdminInput } from '~~/schemas/tokens'
import type { DisplayUserToAdmin } from '~~/types/auth'
import { formatDate } from '~/utils/dates/formatting'
import { USERS_QUERY_KEYS } from '~/utils/queries/users'
import type { FirnUserToken } from '~~/types/tokens'

// Notifications
const { showSuccess, showError } = useFirnToast()

// Helper function to delete user token(s) from cached lists
const deleteUserTokensFromLists = (deletedTokens: DeleteUserTokenByAdminInput, lists: Array<DisplayUserToAdmin[] | undefined>) => {
  for (const list of lists) {
    if (!list) continue
    const currentList = list as DisplayUserToAdmin[]
    const idx = currentList.findIndex(u => u.googleId === deletedTokens.googleId)
    if (idx !== -1) {
      // Create a shallow copy of the list
      const next = currentList.slice()
      const user = { ...next[idx] } as DisplayUserToAdmin
      
      // Retrieve existing user tokens
      const userTokens = user.tokens as FirnUserToken[]
      // Filter out tokens that match the provided IDs
      const updatedTokens = userTokens.filter(token => !deletedTokens.tokenID.includes(token.tokenID))
      
      // Update the user with the filtered tokens
      user.tokens = updatedTokens
      
      // Replace the user in the list
      next.splice(idx, 1, user)
      return next
    }
  }
  return undefined
}

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
      showError(error.message, 'Token could not be generated')
    },
    onSuccess(response, input: GenerateFirnUserTokenInput) {
      const queryCache = useQueryCache()
      queryCache.cancelQueries({ key: USERS_QUERY_KEYS.self(), exact: true })
      queryCache.setQueryData(USERS_QUERY_KEYS.self(), response?.user || undefined)
      queryCache.setQueryData(USERS_QUERY_KEYS.token(), response?.jwt || undefined)
      showSuccess(`A new token for ${response?.user?.googleGivenName} ${response?.user?.googleFamilyName} was successfully issued`, 'New token created')
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
      showError(error.message, 'Token deletion failed')
    },
    onSuccess(response, input: DeleteFirnUserTokenInput) {
      const queryCache = useQueryCache()
      queryCache.cancelQueries({ key: USERS_QUERY_KEYS.self(), exact: true })
      queryCache.setQueryData(USERS_QUERY_KEYS.self(), response || undefined)
      const tokenCount = input.tokenID.length
      const tokenText = tokenCount === 1 ? 'token' : 'tokens'
      const tokenList = tokenCount <= 3 ? input.tokenID.join(', ') : `${tokenCount} tokens`
      showSuccess(`Your ${tokenText} ${tokenList} ${tokenCount === 1 ? 'was' : 'were'} successfully deleted, ${response?.googleGivenName}`, `${tokenCount === 1 ? 'Token' : 'Tokens'} deleted`)
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
      showSuccess('The provided token is valid until ' + formatDate(response?.expiresAt, { relative: false, includeWeekday: true, time: true }), 'Token is valid')
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
      const tokenCount = input.tokenID.length
      const tokenText = tokenCount === 1 ? 'token' : 'tokens'
      const tokenList = tokenCount <= 3 ? input.tokenID.join(', ') : `${tokenCount} tokens`
      showSuccess(`The ${tokenText} ${tokenList} for ${response?.googleGivenName} ${response?.googleFamilyName} ${tokenCount === 1 ? 'was' : 'were'} successfully deleted`, `${tokenCount === 1 ? 'Token' : 'Tokens'} deleted`)
    }
  })
  return { deleteTokenByAdmin: mutate, ...mutation }
})
