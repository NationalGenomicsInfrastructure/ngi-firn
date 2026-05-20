<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { projectBookmarksQuery } from '~/utils/queries/projects'
import { addProjectBookmark, removeProjectBookmark } from '~/utils/mutations/projects'

const props = defineProps<{
  projectId: string
  projectName?: string
}>()

const { state: bookmarksState, asyncStatus: bookmarksAsyncStatus } = useQuery(projectBookmarksQuery)

const bookmarks = computed(() =>
  bookmarksState.value.status === 'success' ? bookmarksState.value.data : []
)

const isBookmarked = computed(() =>
  bookmarks.value.some(b => b.projectId === props.projectId)
)

const { addProjectBookmark: addBookmark, asyncStatus: addAsyncStatus } = addProjectBookmark()
const { removeProjectBookmark: removeBookmark, asyncStatus: removeAsyncStatus } = removeProjectBookmark()

const isPending = computed(() =>
  bookmarksAsyncStatus.value === 'loading'
  || addAsyncStatus.value === 'loading'
  || removeAsyncStatus.value === 'loading'
)

const toggle = computed({
  get: () => isBookmarked.value,
  set(value: boolean) {
    if (value) {
      addBookmark({ projectId: props.projectId })
    }
    else {
      removeBookmark({
        projectId: props.projectId,
        ...(props.projectName !== undefined && { projectName: props.projectName })
      })
    }
  }
})
</script>

<template>
  <NToggle
    v-model="toggle"
    :label="toggle ? 'i-radix-icons-star-filled' : 'i-radix-icons-star'"
    toggle-on="solid-primary"
    toggle-off="soft-gray"
    :disabled="isPending"
    aria-label="Bookmark project"
  />
</template>
