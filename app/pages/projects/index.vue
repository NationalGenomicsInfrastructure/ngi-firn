<script setup lang="ts">
definePageMeta({
  layout: 'private'
})

const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-700 dark:text-primary-300 font-medium'

const {
  statusValue,
  setStatusValue,
  projectIdPrefixValue,
  setProjectIdPrefixValue,
  projectNameFilterValue,
  setProjectNameFilterValue,
  applicationFilterValue,
  setApplicationFilterValue,
  isLoading,
  isError,
  error,
  responseData,
  scanTruncated,
  scanAtMax,
  retrieveMore,
  onValidating
} = useProjectSearch()
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Projects"
      description="View NGI projects in the database."
    />

    <NCard
      title="Find projects"
      description="Search in StatusDB for projects matching your criteria."
      card="soft-gray"
      class="w-full"
      :una="{
        cardContent: 'space-y-4',
        cardDescription: 'text-accent'
      }"
    >
      <form
        class="mb-6 flex flex-wrap items-end gap-4"
        @submit.prevent="onValidating()"
      >
        <NFormField
          name="status"
          label="Status"
          class="min-w-[8rem]"
          :una="{ formLabel: FORM_LABEL_STYLE }"
        >
          <NSelect
            :model-value="statusValue"
            placeholder="Any"
            :items="[
              { value: 'any', label: 'Any' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' }
            ]"
            by="value"
            @update:model-value="(v: unknown) => setStatusValue(v as 'any' | 'open' | 'closed')"
          />
        </NFormField>
        <NFormField
          name="ngi_project_id"
          label="Project ID"
          class="min-w-[10rem]"
          :una="{ formLabel: FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="projectIdPrefixValue ?? ''"
            placeholder="e.g. P12345"
            class="bg-background"
            @update:model-value="(v: unknown) => setProjectIdPrefixValue((v as string) ?? '')"
          />
        </NFormField>
        <NFormField
          name="project_name_filter"
          label="Project Name"
          class="min-w-[10rem]"
          :una="{ formLabel: FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="projectNameFilterValue ?? ''"
            placeholder="e.g. P.Långstrump_45_11"
            class="bg-background"
            @update:model-value="(v: unknown) => setProjectNameFilterValue((v as string) ?? '')"
          />
        </NFormField>
        <NFormField
          name="application_filter"
          label="Application"
          class="min-w-[10rem]"
          :una="{ formLabel: FORM_LABEL_STYLE }"
        >
          <NInput
            :model-value="applicationFilterValue ?? ''"
            placeholder="Filter by application"
            class="bg-background"
            @update:model-value="(v: unknown) => setApplicationFilterValue((v as string) ?? '')"
          />
        </NFormField>
        <NButton
          type="submit"
          leading="i-lucide-search"
          btn="soft-primary hover:outline-primary"
        >
          Search
        </NButton>
      </form>
    </NCard>

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading projects..."
      description="Fetching project list from the database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />
    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading projects"
      :description="error != null ? String(error) : 'Something went wrong. Please try again.'"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />
    <div
      v-else-if="responseData && responseData.available"
      class="mt-6"
    >
      <div
        v-if="scanTruncated"
        class="mb-4 flex flex-wrap items-center gap-3"
      >
        <NAlert
          :alert="scanAtMax ? 'border-warning' : 'border-info'"
          title="Showing the first matches only"
          :description="scanAtMax
            ? 'There may be more matches than we can scan. Refine the project name or application, or narrow by project ID, to see the rest.'
            : 'More projects may match your filter further down the list.'"
          icon="i-lucide-list-filter"
          class="grow"
        />
        <NButton
          v-if="!scanAtMax"
          btn="soft-primary"
          leading="i-lucide-chevrons-down"
          :loading="isLoading"
          @click="retrieveMore()"
        >
          Retrieve more
        </NButton>
      </div>
      <TableProjectSummaryDisplay
        :projects="responseData.items"
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
