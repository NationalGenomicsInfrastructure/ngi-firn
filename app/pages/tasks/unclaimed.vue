<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { taskPoolQuery } from '~/utils/queries/tasks/tasks'
import { TASK_MAX_PAGE_SIZE } from '~~/schemas/tasks/common'

definePageMeta({
  layout: 'private'
})

const { state, asyncStatus } = useQuery(taskPoolQuery({ limit: TASK_MAX_PAGE_SIZE }))

const tasks = computed(() => state.value.status === 'success' ? state.value.data.tasks : [])
const isLoading = computed(() => asyncStatus.value === 'loading')
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Unclaimed tasks"
      description="Public tasks without a responsible person, sorted by priority."
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
