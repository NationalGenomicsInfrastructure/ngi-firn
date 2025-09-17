import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { GenerateFirnUserTokenInput, DeleteFirnUserTokenInput, ValidateFirnUserTokenInput, DeleteUserTokenByAdminInput } from '~~/schemas/tokens'
import type { DisplayUserToAdmin } from '~~/types/auth'

// Notifications
const { showSuccess, showError } = useFirnToast()

// Mutation for generating a Firn user token

export const generateFirnUserToken = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: GenerateFirnUserTokenInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.tokens.generateFirnUserToken.mutate(input)
    },
    onError(error: Error, input: GenerateFirnUserTokenInput) {
      showError(error.message, 'Token could not be generated.')
    },
    onSuccess(response, input: GenerateFirnUserTokenInput) {
      showSuccess('Token generated successfully.', 'Token created')
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
    onError(error: Error, input: DeleteFirnUserTokenInput) {
      showError(error.message, 'Token could not be deleted.')
    },
    onSuccess(response, input: DeleteFirnUserTokenInput) {
      showSuccess('Token deleted successfully.', 'Token deleted')
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
