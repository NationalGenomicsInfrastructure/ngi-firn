<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { taskQuery } from '~/utils/queries/tasks/tasks'
import { taskStepsQuery } from '~/utils/queries/tasks/steps'
import { hasTrpcErrorCode } from '~/utils/errors'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const taskSlug = computed(() => {
  const value = route.params.taskid
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

// Fetched in the browser only: a query that fails during server rendering (e.g. NOT_FOUND) turns
// the whole page into a 500, and its error cannot be serialised into the payload either.
const { state: taskState } = useQuery(() => ({
  ...taskQuery(taskSlug.value),
  enabled: import.meta.client
}))
const { state: stepsState, asyncStatus: stepsStatus } = useQuery(() => ({
  ...taskStepsQuery(taskSlug.value),
  enabled: import.meta.client
}))

// Keep showing cached data while a background refetch runs or after one fails.
const task = computed(() => taskState.value.data)
const steps = computed(() => stepsState.value.data)

// A private task the user may not read is reported as not found, so its existence is not revealed.
const isNotFound = computed(() => hasTrpcErrorCode(taskState.value.error, 'NOT_FOUND'))

useHead(() => ({
  title: `${task.value?.title ?? 'Task details'} — NGI Firn`
}))
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <NButton
      btn="ghost-gray"
      leading="i-lucide-arrow-left"
      size="sm"
      label="Back to your tasks"
      to="/tasks/own"
    />
    <PageTitle
      title="Task details"
      description="View the task metadata, the people involved and the progress so far."
    />

    <!-- A task that is gone must not linger on screen, even when it is still cached. -->
    <NAlert
      v-if="isNotFound"
      alert="border-warning"
      title="Task not found"
      description="This task does not exist, or you do not have access to it."
      icon="i-lucide-search-x"
    />
    <NAlert
      v-else-if="!task && taskState.status === 'error'"
      alert="border-error"
      title="Could not load the task"
      :description="taskState.error.message || 'Something went wrong. Please try again.'"
      icon="i-lucide-alert-circle"
    />
    <NAlert
      v-else-if="!task"
      alert="border-gray"
      title="Loading task..."
      description="Fetching the task details."
      icon="i-lucide-loader-2"
    />

    <div
      v-else
      class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 items-start"
    >
      <CardTask :task="task" />

      <section class="min-w-0 space-y-4">
        <PageSectionHeading
          title="Steps"
          :meta="steps ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}` : undefined"
        />
        <NAlert
          v-if="stepsState.status === 'error'"
          alert="border-error"
          title="Could not load the steps"
          :description="stepsState.error.message || 'Something went wrong. Please try again.'"
          icon="i-lucide-alert-circle"
        />
        <TaskStepsSummary
          v-if="steps?.length"
          :steps="steps"
        />
        <TableTaskSteps
          v-if="steps || stepsStatus === 'loading'"
          :steps="steps ?? []"
          :loading="!steps"
        />
      </section>
    </div>
  </main>
</template>
