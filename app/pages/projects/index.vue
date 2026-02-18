<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { ListProjectsSummaryInputSchema } from '~~/schemas/projects'
import { projectSummariesQuery } from '~/utils/queries/projects'

definePageMeta({
  layout: 'private'
})

// Form state: allow empty string for "any" status; we strip it when building query params
const searchParams = ref<ListProjectsSummaryInputSchema & { status?: 'open' | 'closed' | '' }>({})

const queryParams = computed<ListProjectsSummaryInputSchema>(() => {
  const p = searchParams.value
  const out: ListProjectsSummaryInputSchema = {}
  if (p.status === 'open' || p.status === 'closed') out.status = p.status
  if (p.project_id_prefix?.trim()) out.project_id_prefix = p.project_id_prefix.trim()
  if (p.project_name_filter?.trim()) out.project_name_filter = p.project_name_filter.trim()
  if (p.application_filter?.trim()) out.application_filter = p.application_filter.trim()
  if (p.limit != null) out.limit = p.limit
  if (p.skip != null) out.skip = p.skip
  return out
})

const { state, asyncStatus } = useQuery(() => projectSummariesQuery(queryParams.value))

const isLoading = computed(() => asyncStatus.value === 'loading')
const isError = computed(() => state.value.status === 'error')
const error = computed(() => state.value.status === 'error' ? state.value.error : undefined)
const responseData = computed(() => state.value.status === 'success' ? state.value.data : undefined)
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Projects"
      description="View NGI projects in the database."
    />

    <form
      class="mb-6 flex flex-wrap items-end gap-4"
      @submit.prevent
    >
      <div class="flex flex-col gap-1">
        <label
          for="projects-status"
          class="text-sm font-medium"
        >Status</label>
        <select
          id="projects-status"
          v-model="searchParams.status"
          class="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">
            Any
          </option>
          <option value="open">
            Open
          </option>
          <option value="closed">
            Closed
          </option>
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label
          for="projects-id-prefix"
          class="text-sm font-medium"
        >Project ID prefix</label>
        <input
          id="projects-id-prefix"
          v-model="searchParams.project_id_prefix"
          type="text"
          class="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. MA."
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          for="projects-name"
          class="text-sm font-medium"
        >Project name</label>
        <input
          id="projects-name"
          v-model="searchParams.project_name_filter"
          type="text"
          class="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Substring, case-insensitive"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          for="projects-application"
          class="text-sm font-medium"
        >Application</label>
        <input
          id="projects-application"
          v-model="searchParams.application_filter"
          type="text"
          class="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Filter by application"
        >
      </div>
    </form>

    <div
      v-if="isLoading"
      class="flex justify-center items-center py-12"
    >
      Loading projects...
    </div>
    <div
      v-else-if="isError"
      class="rounded border border-red-200 bg-red-50 p-4 text-red-800"
    >
      <p class="font-medium">
        Error loading projects
      </p>
      <pre
        v-if="error"
        class="mt-2 overflow-auto text-sm"
      >{{ error }}</pre>
    </div>
    <div
      v-else-if="responseData"
      class="overflow-auto rounded border border-gray-200 bg-gray-50 p-4"
    >
      <pre class="text-sm">{{ JSON.stringify(responseData, null, 2) }}</pre>
    </div>
  </main>
</template>
