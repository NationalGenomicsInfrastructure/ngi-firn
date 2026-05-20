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
  <main class="mx-auto max-w-4xl px-4 py-8 lg:px-8 sm:px-6">
    <NCard
      card="outline-gray"
      :una="{ cardDescription: 'text-muted' }"
      class="mb-8"
    >
      <template #header>
        <h1 class="text-2xl font-bold">
          Welcome to the Firn dashboard!
        </h1>
      </template>
    </NCard>

    <section class="space-y-4">
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
  </main>
</template>
