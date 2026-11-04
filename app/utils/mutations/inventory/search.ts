import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { SearchRebuildResult } from '~~/types/search'
import { INVENTORY_SEARCH_QUERY_KEYS } from '~/utils/queries/inventory/search'

// Notifications
const { showSuccess, showError, showInfo } = useFirnToast()

/*
 * Admin-only manual trigger for a full search-index rebuild. The server runs the rebuild detached
 * and returns immediately, so there is no optimistic cache update — we just report whether the
 * rebuild was accepted and invalidate the status query so the maintenance panel starts refreshing.
 */
export const rebuildSearchIndex = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (): Promise<SearchRebuildResult> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.search.rebuild.mutate()
    },

    onSuccess(result) {
      if (result.status === 'accepted') {
        showSuccess('Search index rebuild started. This runs in the background.', 'Rebuild started')
      }
      else if (result.status === 'already-running') {
        showInfo('A rebuild is already in progress.', 'Rebuild in progress')
      }
      else {
        showError('Search is not configured, so it cannot be rebuilt.', 'Search unavailable')
      }
    },

    onError(error) {
      showError(error.message, 'Rebuild could not be started')
    },

    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_SEARCH_QUERY_KEYS.status(), exact: true })
    }
  })
  return { rebuildSearchIndex: mutate, ...mutation }
})
