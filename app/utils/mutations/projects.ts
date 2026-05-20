import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { AddProjectBookmarkInputSchema, RemoveProjectBookmarkInputSchema } from '~~/schemas/projects'
import type { FirnProjectBookmark } from '~~/types/projects-firn'
import { PROJECTS_QUERY_KEYS } from '~/utils/queries/projects'

// Notifications
const { showSuccess, showError } = useFirnToast()

function setBookmarksCache(bookmarks: FirnProjectBookmark[]) {
  const queryCache = useQueryCache()
  queryCache.cancelQueries({ key: PROJECTS_QUERY_KEYS.bookmarks(), exact: true })
  queryCache.setQueryData(PROJECTS_QUERY_KEYS.bookmarks(), bookmarks)
}

function filterBookmark(
  bookmarks: FirnProjectBookmark[],
  projectId: string,
  projectName?: string
): FirnProjectBookmark[] {
  return bookmarks.filter((b) => {
    if (b.projectId !== projectId)
      return true
    if (projectName !== undefined && b.projectName !== projectName)
      return true
    return false
  })
}

export const addProjectBookmark = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: AddProjectBookmarkInputSchema) => {
      const { $trpc } = useNuxtApp()
      return $trpc.projects.addProjectBookmark.mutate(input)
    },
    onMutate() {
      const queryCache = useQueryCache()
      const bookmarks = queryCache.getQueryData<FirnProjectBookmark[]>(PROJECTS_QUERY_KEYS.bookmarks()) ?? []
      return { bookmarks }
    },
    onError(error: Error, _input: AddProjectBookmarkInputSchema, context: { bookmarks?: FirnProjectBookmark[] }) {
      const queryCache = useQueryCache()
      if (context.bookmarks) {
        queryCache.setQueryData(PROJECTS_QUERY_KEYS.bookmarks(), context.bookmarks)
      }
      showError(error.message, 'Project could not be bookmarked')
    },
    onSuccess(response, input: AddProjectBookmarkInputSchema) {
      if (response === null) {
        showError('The project could not be found or bookmarked.', 'Project could not be bookmarked')
        return
      }
      setBookmarksCache(response)
      showSuccess(`Project ${input.projectId} has been bookmarked.`, 'Project bookmarked')
    }
  })
  return { addProjectBookmark: mutate, ...mutation }
})

export const removeProjectBookmark = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: RemoveProjectBookmarkInputSchema) => {
      const { $trpc } = useNuxtApp()
      return $trpc.projects.removeProjectBookmark.mutate(input)
    },
    onMutate(input: RemoveProjectBookmarkInputSchema) {
      const queryCache = useQueryCache()
      const bookmarks = queryCache.getQueryData<FirnProjectBookmark[]>(PROJECTS_QUERY_KEYS.bookmarks()) ?? []
      const optimistic = filterBookmark(bookmarks, input.projectId, input.projectName)
      queryCache.cancelQueries({ key: PROJECTS_QUERY_KEYS.bookmarks(), exact: true })
      queryCache.setQueryData(PROJECTS_QUERY_KEYS.bookmarks(), optimistic)
      return { bookmarks }
    },
    onError(error: Error, _input: RemoveProjectBookmarkInputSchema, context: { bookmarks?: FirnProjectBookmark[] }) {
      const queryCache = useQueryCache()
      if (context.bookmarks) {
        queryCache.setQueryData(PROJECTS_QUERY_KEYS.bookmarks(), context.bookmarks)
      }
      showError(error.message, 'Bookmark could not be removed')
    },
    onSuccess(response, input: RemoveProjectBookmarkInputSchema) {
      if (response === null) {
        showError('The bookmark could not be removed.', 'Bookmark could not be removed')
        return
      }
      setBookmarksCache(response)
      const label = input.projectName ?? input.projectId
      showSuccess(`Bookmark for ${label} has been removed.`, 'Bookmark removed')
    }
  })
  return { removeProjectBookmark: mutate, ...mutation }
})
