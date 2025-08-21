import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { DisplayUserToAdmin } from '~~/types/auth'
import type { CreateUserByAdminInput, DeleteUserByAdminInput, SetUserAccessByAdminInput } from '~~/schemas/users'
import { USERS_QUERY_KEYS } from '~/utils/queries/users'

// Notifications
const { showSuccess, showError} = useFirnToast()

// Helper function to optimistically update cached lists so tables reflect changes instantly
const updateUserInLists = ( updatedUser: SetUserAccessByAdminInput, lists: Array<DisplayUserToAdmin[] | undefined>) => {
  for (const list of lists) {
    if (!list) continue
    const currentList = list as DisplayUserToAdmin[]
    const idx = currentList.findIndex(u => u.googleId === updatedUser.googleId)
    if (idx !== -1) { // if the user is found in the list. -1 is returned by findIndex if the user is not found.
      // slice() method is used to create a shallow copy of a portion of an array into a new array object
      const next = currentList.slice()
      const user: DisplayUserToAdmin = { ...next[idx] } as DisplayUserToAdmin
      user.allowLogin = updatedUser.allowLogin
      user.isRetired = updatedUser.isRetired
      user.isAdmin = updatedUser.isAdmin
      // The splice() method changes the contents of an array by removing or replacing existing elements and/or adding new elements in place.
      next.splice(idx, 1, user)
      return next
    }
  }
  return undefined
}

// Helper function to delete a user from cached lists
const deleteUserFromLists = (deletedUser: DeleteUserByAdminInput, lists: Array<DisplayUserToAdmin[] | undefined>) => {
  for (const list of lists) {
    if (!list) continue
    const currentList = list as DisplayUserToAdmin[]
    const idx = currentList.findIndex(u => u.googleId === deletedUser.googleId)
    if (idx !== -1) {
      const next = currentList.slice()
      next.splice(idx, 1)
      return next
    }
  }
  return undefined
}

// Mutation for creating a user by an admin

export const createUserByAdmin = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
  mutation: (input: CreateUserByAdminInput) => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.createUserByAdmin.mutate(input)
  },
  onMutate() {
    const queryCache = useQueryCache()
    const approved = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved()) || [];
    return { approved }
  },
  onError(error: Error, input: CreateUserByAdminInput, context: { approved?: DisplayUserToAdmin[] }) {
    const queryCache = useQueryCache()
    if (context.approved) {
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), context.approved)
    } else {
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), [])
    }
    showError(error.message, `User ${input.googleGivenName} ${input.googleFamilyName} could not be created.`);
  },
  onSuccess(response, input: CreateUserByAdminInput) {
    const queryCache = useQueryCache()
    const approved = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved()) || [];
    const newUser = response as DisplayUserToAdmin
    queryCache.cancelQueries({key: USERS_QUERY_KEYS.approved(), exact: true})
    queryCache.setQueryData(USERS_QUERY_KEYS.approved(), [newUser, ...approved])
    showSuccess(`User ${input.googleGivenName} ${input.googleFamilyName} created successfully.`, `${input.googleGivenName} ${input.googleFamilyName} created`);
  },
})
return { createUser: mutate, ...mutation }
})

// Mutation for deleting a user by an admin

export const deleteUserByAdmin = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
  mutation: (input: DeleteUserByAdminInput) => {
    const { $trpc } = useNuxtApp()
    return $trpc.users.deleteUserByAdmin.mutate(input)
  },
  onMutate(input: DeleteUserByAdminInput) {
    const queryCache = useQueryCache()
    const approved = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved()) || [];
    const retired = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.retired()) || [];
    const pending = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.pending()) || [];

    const updatedApproved = deleteUserFromLists(input,[approved])
    if (updatedApproved) {
      queryCache.cancelQueries({key: USERS_QUERY_KEYS.approved(), exact: true})
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), updatedApproved)
    }

    const updatedRetired = deleteUserFromLists(input,[retired])
    if (updatedRetired) {
      queryCache.cancelQueries({key: USERS_QUERY_KEYS.retired(), exact: true})
      queryCache.setQueryData(USERS_QUERY_KEYS.retired(), updatedRetired)
    }

    const updatedPending = deleteUserFromLists(input,[pending])
    if (updatedPending) {
      queryCache.cancelQueries({key: USERS_QUERY_KEYS.pending(), exact: true})
      queryCache.setQueryData(USERS_QUERY_KEYS.pending(), updatedPending)
    }
    return { approved, retired, pending, updatedApproved, updatedRetired, updatedPending }
  },
  onSettled() {
    const queryCache = useQueryCache()
    queryCache.invalidateQueries({key: USERS_QUERY_KEYS.approved(), exact: true})
    queryCache.invalidateQueries({key: USERS_QUERY_KEYS.retired(), exact: true})
    queryCache.invalidateQueries({key: USERS_QUERY_KEYS.pending(), exact: true})
  },
  onError(error: Error, input: DeleteUserByAdminInput, context: { approved?: DisplayUserToAdmin[], retired?: DisplayUserToAdmin[], pending?: DisplayUserToAdmin[], updatedApproved?: DisplayUserToAdmin[], updatedRetired?: DisplayUserToAdmin[], updatedPending?: DisplayUserToAdmin[] }) {
    const queryCache = useQueryCache()
    // rollback the optimistic updates if possible
    if (context.approved) {
      queryCache.setQueryData(USERS_QUERY_KEYS.approved(), context.approved)
    } 
    if (context.retired) {
      queryCache.setQueryData(USERS_QUERY_KEYS.retired(), context.retired)
    } 
    if (context.pending) {
      queryCache.setQueryData(USERS_QUERY_KEYS.pending(), context.pending)
    } 
    showError(error.message, `User ${input.googleGivenName} ${input.googleFamilyName} could not be deleted.`);
  },
  onSuccess(response, input: DeleteUserByAdminInput) {
    showSuccess(`User deleted successfully.`, `${input.googleGivenName} ${input.googleFamilyName} deleted`);
  },
})
return { deleteUser: mutate, ...mutation }
})

// Mutation for updating user access by an admin

export const setUserAccessByAdmin = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: SetUserAccessByAdminInput) => {
      const { $trpc } = useNuxtApp();
      return $trpc.users.setUserAccessByAdmin.mutate(input);
    },
    onMutate(input: SetUserAccessByAdminInput) {
      const queryCache = useQueryCache()
      const approved = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.approved()) || [];
      const retired = queryCache.getQueryData<DisplayUserToAdmin[]>(USERS_QUERY_KEYS.retired()) || [];
  
      // Update the list where the user currently exists 
      // (as of now, only relevant when admin rights changed, since no other values are editable in place)
      const updatedApproved = updateUserInLists(input,[approved])
      if (updatedApproved) {
        queryCache.cancelQueries({key: USERS_QUERY_KEYS.approved(), exact: true})
        queryCache.setQueryData(USERS_QUERY_KEYS.approved(), updatedApproved)
      }
  
      const updatedRetired = updateUserInLists(input,[retired])
      if (updatedRetired) {
        queryCache.cancelQueries({key: USERS_QUERY_KEYS.retired(), exact: true})
        queryCache.setQueryData(USERS_QUERY_KEYS.retired(), updatedRetired)
      }
  
      // If state changed across lists (active <-> retired), move user between lists optimistically
      if (approved && retired) {
        const wasInApproved = approved.some(u => u.googleId === input.googleId)
        const shouldBeRetired = input.isRetired
  
        if (wasInApproved && shouldBeRetired) {
          const user = approved.find(u => u.googleId === input.googleId)!
          const updatedUser: DisplayUserToAdmin = { ...user } as DisplayUserToAdmin
          updatedUser.allowLogin = input.allowLogin
          updatedUser.isRetired = input.isRetired
          updatedUser.isAdmin = input.isAdmin
          queryCache.setQueryData(USERS_QUERY_KEYS.approved(), approved.filter(u => u.googleId !== input.googleId))
          queryCache.setQueryData(USERS_QUERY_KEYS.retired(), [updatedUser, ...(retired ?? [])])
        }
  
        const wasInRetired = retired.some(u => u.googleId === input.googleId)
        const shouldBeActive = !input.isRetired && input.allowLogin
        if (wasInRetired && shouldBeActive) {
          const user = retired.find(u => u.googleId === input.googleId)!
          const updatedUser: DisplayUserToAdmin = { ...user } as DisplayUserToAdmin
          updatedUser.allowLogin = input.allowLogin
          updatedUser.isRetired = input.isRetired
          updatedUser.isAdmin = input.isAdmin
          queryCache.setQueryData(USERS_QUERY_KEYS.retired(), retired.filter(u => u.googleId !== input.googleId))
          queryCache.setQueryData(USERS_QUERY_KEYS.approved(), [updatedUser, ...(approved ?? [])])
        }
      }

      return { approved, retired, updatedApproved, updatedRetired };
    },
    onSettled() {
      const queryCache = useQueryCache()
      // Invalidate the queries to refetch the data from the server
      queryCache.invalidateQueries({key: USERS_QUERY_KEYS.approved(), exact: true})
      queryCache.invalidateQueries({key: USERS_QUERY_KEYS.retired(), exact: true})
    },
    onError(error: Error, input ,context: { approved?: DisplayUserToAdmin[], retired?: DisplayUserToAdmin[], updatedApproved?: DisplayUserToAdmin[], updatedRetired?: DisplayUserToAdmin[] }) {
      const queryCache = useQueryCache()
      // Rollback the optimistic updates
      if (context.approved) {
        queryCache.setQueryData(USERS_QUERY_KEYS.approved(), context.approved);
      } else {
        // in case we do not have the previous state, rather show an empty table and refetch the data from the server
        queryCache.setQueryData(USERS_QUERY_KEYS.approved(), []);
      }
      if (context.retired) {
        queryCache.setQueryData(USERS_QUERY_KEYS.retired(), context.retired);
      } else {
        // in case we do not have the previous state, rather show an empty table and refetch the data from the server
        queryCache.setQueryData(USERS_QUERY_KEYS.retired(), []);
      }
      showError(error.message, `Error setting permissions for ${input.googleGivenName} ${input.googleFamilyName}`);
    },
    onSuccess(_data, input: SetUserAccessByAdminInput) {
      showSuccess(`Permissions updated successfully. User ${input.googleGivenName} ${input.googleFamilyName} is now ${input.isRetired ? 'retired' : 'active'} and ${input.isAdmin ? 'can administer Firn.' : 'cannot administer Firn.'}`, `${input.googleGivenName} ${input.googleFamilyName} updated`);
    }
  });

  return { setUserAccess: mutate, ...mutation };
});
