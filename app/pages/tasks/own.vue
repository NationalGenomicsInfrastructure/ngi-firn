<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { tasksQuery } from '~/utils/queries/tasks/tasks'
import { TASK_MAX_PAGE_SIZE } from '~~/schemas/tasks/common'

definePageMeta({
  layout: 'private'
})

const { state, asyncStatus } = useQuery(tasksQuery({ limit: TASK_MAX_PAGE_SIZE }))

// The listing also returns public and view-only tasks; "own" means owned or assigned and still active.
const tasks = computed(() => {
  if (state.value.status !== 'success') return []
  return state.value.data.tasks.filter(task =>
    (task.viewerRole === 'owner' || task.viewerRole === 'responsible')
    && (task.status === 'draft' || task.status === 'open')
  )
})
const isLoading = computed(() => asyncStatus.value === 'loading')
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Your tasks"
      description="Tasks you own or are responsible for, sorted by priority."
    />
    <NAlert
      v-if="state.status === 'error'"
      alert="border-error"
      title="Could not load tasks"
      :description="state.error != null ? String(state.error) : 'Something went wrong. Please try again.'"
      icon="i-lucide-alert-circle"
    />
    <TaskArray
      v-else
      :tasks="tasks"
      :loading="isLoading"
    />
  </main>
</template>
