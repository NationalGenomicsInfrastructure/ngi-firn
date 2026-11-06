<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const {
  queryInput,
  status,
  applications,
  coordinators,
  labResponsibles,
  bioinfoResponsibles,
  filterOptions,
  isLoading,
  isError,
  error,
  responseData,
  results,
  isDegraded,
  hasActiveCriteria,
  canShowMore,
  showMore,
  reset
} = useProjectSearch()
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Projects"
      description="View NGI projects in the database."
    />

    <FilterBar label="Find projects">
      <template #primary>
        <NInput
          :model-value="queryInput"
          placeholder="Search by project ID, name, application, organism, people, comments…"
          leading="i-lucide-search"
          input="~"
          size="lg"
          aria-label="Search projects"
          class="flex-1 text-lg"
          :una="{ inputWrapper: 'w-full', input: 'h-14 bg-transparent text-lg ring-0 focus-visible:ring-0 shadow-none' }"
          @update:model-value="queryInput = ($event as string) ?? ''"
        >
          <template
            v-if="queryInput"
            #trailing
          >
            <NButton
              label="i-lucide-x"
              icon
              btn="ghost-gray"
              size="sm"
              aria-label="Clear search"
              @click="queryInput = ''"
            />
          </template>
        </NInput>
      </template>

      <div class="flex flex-wrap items-end gap-4">
        <div class="flex flex-col gap-1 min-w-[8rem]">
          <FilterLabel>Status</FilterLabel>
          <NSelect
            :model-value="status"
            :items="[
              { value: 'any', label: 'Any' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' }
            ]"
            by="value"
            aria-label="Status"
            @update:model-value="(v: unknown) => status = v as 'any' | 'open' | 'closed'"
          />
        </div>
        <FilterMultiSelect
          v-if="filterOptions?.applications.length"
          v-model="applications"
          label="Application"
          placeholder="Any"
          :options="filterOptions.applications"
        />
        <FilterMultiSelect
          v-if="filterOptions?.coordinators.length"
          v-model="coordinators"
          label="Coordinator"
          placeholder="Any"
          :options="filterOptions.coordinators"
        />
        <FilterMultiSelect
          v-if="filterOptions?.labResponsibles.length"
          v-model="labResponsibles"
          label="Lab responsible"
          placeholder="Any"
          :options="filterOptions.labResponsibles"
        />
        <FilterMultiSelect
          v-if="filterOptions?.bioinfoResponsibles.length"
          v-model="bioinfoResponsibles"
          label="Bioinfo responsible"
          placeholder="Any"
          :options="filterOptions.bioinfoResponsibles"
        />
        <NButton
          v-if="hasActiveCriteria"
          btn="ghost-gray"
          leading="i-lucide-filter-x"
          label="Clear all"
          @click="reset()"
        />
      </div>
    </FilterBar>

    <NAlert
      v-if="isDegraded"
      alert="border-amber"
      title="Basic search only"
      description="The search index is not available right now, so results come straight from the database: free text matches project ID prefixes and names only, and long result lists may be incomplete."
      icon="i-lucide-cloud-off"
      class="mb-4"
    />

    <NAlert
      v-if="isError"
      alert="border-error"
      title="Error loading projects"
      :description="error != null ? String(error) : 'Something went wrong. Please try again.'"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />
    <NAlert
      v-else-if="isLoading && !responseData"
      alert="border-gray"
      title="Loading projects..."
      description="Fetching project list from the database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />
    <div
      v-else-if="results"
      class="mt-6"
    >
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <p class="text-sm text-muted grow">
          {{ results.totalIsEstimated ? 'About' : '' }}
          <span class="font-semibold">{{ results.total.toLocaleString() }}</span>
          {{ results.total === 1 ? 'project' : 'projects' }}
          <template v-if="results.hasMore">
            · showing the first {{ results.items.length.toLocaleString() }}
          </template>
        </p>
        <NButton
          v-if="canShowMore"
          btn="soft-primary"
          leading="i-lucide-chevrons-down"
          :loading="isLoading"
          @click="showMore()"
        >
          Show more
        </NButton>
      </div>
      <TableProjectSummaryDisplay
        :projects="results.items"
        :loading="isLoading"
      />
    </div>
    <NAlert
      v-else-if="responseData && !responseData.available"
      alert="border-warning"
      title="Projects database is not available."
      description="The projects database is currently not available. Please try again later."
      icon="i-lucide-database-off"
      class="mt-6"
    />
  </main>
</template>
