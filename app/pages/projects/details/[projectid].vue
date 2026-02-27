<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import type { Project, ProjectDetails, OrderDetails, ProjectSummary, ProjectStatusFields, ProjectSample, ProjectPriority } from '~~/types/projects'
import { projectQuery } from '~/utils/queries/projects'

definePageMeta({
  layout: 'private',
  middleware: ['validate-project-id']
})

const route = useRoute()
const projectId = computed(() => route.params.projectid as string)

const { state, asyncStatus } = useQuery(() => projectQuery(projectId.value))

const isLoading = computed(() => asyncStatus.value === 'loading')
const isError = computed(() => state.value.status === 'error')
const error = computed(() => state.value.status === 'error' ? state.value.error : undefined)
const responseData = computed(() => state.value.status === 'success' ? state.value.data : undefined)

const project = computed<Project | undefined>(() => {
  if (responseData.value?.available && responseData.value.data) {
    return responseData.value.data as Project
  }
  return undefined
})

const pageTitle = computed(() => project.value?.project_name ?? projectId.value)
const pageDescription = computed(() => {
  const parts: string[] = [projectId.value]
  const sf = project.value?.status_fields as ProjectStatusFields | undefined
  if (sf?.status) parts.push(sf.status)
  return parts.join(' — ')
})

// Set the page title and description. Since the code runs top to bottom,
// useHead() must not be called before pageTitle or pageDescription are declared
useHead(() => ({
  title: `${pageDescription.value} — NGI Firn`,
}))

const projectStatusFields = computed(() =>
  project.value?.status_fields as ProjectStatusFields | undefined
)
const projectSummary = computed(() =>
  project.value?.project_summary as ProjectSummary | undefined
)
const projectDetails = computed(() =>
  project.value?.details as ProjectDetails | undefined
)
const projectOrderDetails = computed(() =>
  project.value?.order_details as OrderDetails | undefined
)
const projectSamples = computed((): Record<string, ProjectSample> =>
  (project.value?.samples as Record<string, ProjectSample>) ?? {}
)
const projectPriority = computed(() =>
  project.value?.priority as ProjectPriority
)
const projectOpenDate = computed(() =>
  project.value?.open_date as string | undefined
)
const projectCloseDate = computed(() =>
  project.value?.close_date as string | undefined
)
const projectNoOfSamples = computed(() =>
  project.value?.no_of_samples as number | undefined
)
const projectApplication = computed(() =>
  project.value?.application as string | null | undefined
)
const projectAffiliation = computed(() =>
  project.value?.affiliation as string | undefined
)
const projectContact = computed(() =>
  project.value?.contact as string | null | undefined
)
const projectDeliveryType = computed(() =>
  project.value?.delivery_type as string | undefined
)
const projectReferenceGenome = computed(() =>
  project.value?.reference_genome as string | undefined
)
const projectSummaryLinks = computed(() =>
  project.value?.project_summary_links as [string, string][] | undefined
)
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <div class="mb-6 flex items-center gap-3">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Projects"
        @click="$router.push('/projects')"
      />
    </div>

    <PageTitle
      :title="pageTitle"
      :description="pageDescription"
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading project..."
      description="Fetching project data from the database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />
    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading project"
      :description="error != null ? String(error) : 'Something went wrong. Please try again.'"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />
    <NAlert
      v-else-if="responseData && !responseData.available"
      alert="border-warning"
      title="Projects database is not available."
      description="The projects database is currently not available. Please try again later."
      icon="i-lucide-database-off"
      class="mt-6"
    />
    <NAlert
      v-else-if="responseData?.available && !responseData.data"
      alert="border-warning"
      title="Project not found"
      :description="`No project found with ID ${projectId}.`"
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <template v-else-if="project">
      <NTabs default-value="overview">
        <NTabsList class="mx-auto">
          <NTabsTrigger value="overview">
            <NIcon name="i-lucide-layout-dashboard" />
            Overview
          </NTabsTrigger>
          <NTabsTrigger value="details">
            <NIcon name="i-lucide-list" />
            Details
          </NTabsTrigger>
          <NTabsTrigger value="order">
            <NIcon name="i-lucide-shopping-cart" />
            Order
          </NTabsTrigger>
          <NTabsTrigger value="samples">
            <NIcon name="i-lucide-test-tubes" />
            Samples
          </NTabsTrigger>
          <NTabsTrigger value="timeline">
            <NIcon name="i-lucide-calendar-range" />
            Timeline
          </NTabsTrigger>
        </NTabsList>

        <NTabsContent value="overview">
          <div class="mt-6">
            <ProjectOverview
              :summary-title="projectOrderDetails?.title ?? 'Overview'"
              :project-name="project.project_name"
              :project-id="project.project_id"
              :status-fields="projectStatusFields"
              :priority="projectPriority"
              :open-date="projectOpenDate"
              :close-date="projectCloseDate"
              :no-of-samples="projectNoOfSamples"
              :application="projectApplication"
              :affiliation="projectAffiliation"
              :contact="projectContact"
              :delivery-type="projectDeliveryType"
              :reference-genome="projectReferenceGenome"
            />
          </div>
          <div class="mt-6">
            <LazyProjectSummary
              :project-summary="projectSummary"
              :project-summary-links="projectSummaryLinks"
            />
          </div>
        </NTabsContent>

        <NTabsContent value="details">
          <div class="mt-6">
            <LazyProjectDetails
              :details="projectDetails"
            />
          </div>
        </NTabsContent>

        <NTabsContent value="order">
          <div class="mt-6">
            <LazyProjectOrderDetails
              :order-details="projectOrderDetails"
            />
          </div>
        </NTabsContent>

        <NTabsContent value="samples">
          <div class="mt-6">
            <LazyTableProjectSamples
              :samples="projectSamples"
              :loading="isLoading"
            />
          </div>
        </NTabsContent>

        <NTabsContent value="timeline">
          <StepperProjectTimeline :project="project" />
        </NTabsContent>
      </NTabs>
    </template>
  </main>
</template>
