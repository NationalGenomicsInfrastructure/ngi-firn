<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { projectBookmarksQuery } from '~/utils/queries/projects'

definePageMeta({
  layout: 'private'
})

const { setOpen } = useSidebar()
const { session } = useUserSession()
const { authStatusWatcher } = useAuthStatusToast()

const { state: bookmarksState, asyncStatus: bookmarksAsyncStatus } = useQuery(projectBookmarksQuery)

const isLoading = computed(() => bookmarksAsyncStatus.value === 'loading')
const bookmarks = computed(() =>
  bookmarksState.value.status === 'success' ? bookmarksState.value.data : undefined
)

onMounted(() => {
  setOpen(false)
  if (session.value?.authStatus) {
    session.value.authStatus = undefined
  }
})

onUnmounted(() => {
  if (authStatusWatcher) {
    authStatusWatcher()
  }
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Welcome to Firn!"
    />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      <NCard
        title="About Firn"
        description="Your starting point for NGI project workflows."
        card="outline-gray"
        :una="{ cardDescription: 'text-muted' }"
      >
        <p class="text-sm text-muted">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
        </p>
        <p class="text-sm text-muted mt-4">
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </p>
      </NCard>

      <section class="space-y-4 min-w-0">
        <NAlert
          v-if="bookmarksState.status === 'error'"
          alert="border-error"
          title="Could not load bookmarks"
          :description="bookmarksState.error != null ? String(bookmarksState.error) : 'Something went wrong. Please try again.'"
          icon="i-lucide-alert-circle"
        />

        <TableProjectBookmarks
          v-else
          :bookmarks="bookmarks ?? []"
          :loading="isLoading"
        />
      </section>
    </div>
  </main>
</template>
