<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useQuery } from '@pinia/colada'
import * as z from 'zod'
import type { ListProjectsSummaryInputSchema } from '~~/schemas/projects'
import { projectSummariesQuery } from '~/utils/queries/projects'

definePageMeta({
  layout: 'private'
})

// Form schema: status uses 'any'; ngi_project_id / project_name_filter optional but must match regex when non-empty
const searchFormSchema = toTypedSchema(z.object({
  status: z.enum(['any', 'open', 'closed']),
  ngi_project_id: z.string().optional().refine(v => !v || /^P[0-9]+$/.test(v), { message: 'P followed by digits (e.g. P1, P00017)' }),
  project_name_filter: z.string().optional().refine(v => !v || /^[\p{Lu}]\.[\p{L}]+_[0-9]{2}_[0-9]+$/u.test(v), { message: 'Format: Capital.Description_YY_NN' }),
  application_filter: z.string().optional()
}))

type SearchFormValues = {
  status: 'any' | 'open' | 'closed'
  ngi_project_id?: string
  project_name_filter?: string
  application_filter?: string
}

const { handleSubmit, validate, errors } = useForm({
  validationSchema: searchFormSchema,
  initialValues: {
    status: 'any' as const,
    ngi_project_id: '',
    project_name_filter: '',
    application_filter: ''
  }
})

// Bind fields explicitly so form state updates on input (NFormField + NSelect/NInput may not sync otherwise)
const { value: statusValue, setValue: setStatusValue } = useField<SearchFormValues['status']>('status')
const { value: projectIdPrefixValue, setValue: setProjectIdPrefixValue } = useField<string>('ngi_project_id')
const { value: projectNameFilterValue, setValue: setProjectNameFilterValue } = useField<string>('project_name_filter')
const { value: applicationFilterValue, setValue: setApplicationFilterValue } = useField<string>('application_filter')

// Applied search params (set on submit or when project ID/name become valid); query uses these
const searchParams = ref<ListProjectsSummaryInputSchema & { status?: 'open' | 'closed' }>({})

const queryParams = computed<ListProjectsSummaryInputSchema>(() => {
  const p = searchParams.value
  const out: ListProjectsSummaryInputSchema = {}
  if (p.status === 'open' || p.status === 'closed') out.status = p.status
  if (p.ngi_project_id?.trim()) out.ngi_project_id = p.ngi_project_id.trim()
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

function applySearchValues(values: SearchFormValues) {
  searchParams.value = {
    ...(values.status && values.status !== 'any' && { status: values.status }),
    ...(values.ngi_project_id?.trim() && { ngi_project_id: values.ngi_project_id.trim() }),
    ...(values.project_name_filter?.trim() && { project_name_filter: values.project_name_filter.trim() }),
    ...(values.application_filter?.trim() && { application_filter: values.application_filter.trim() })
  }
}

// Submit handler: same pattern as onTokenTest in FormValidateToken – call the function returned by handleSubmit
const onSearchSubmit = handleSubmit((values: SearchFormValues) => {
  applySearchValues(values)
})

// Run validation, focus first error field, then run submit (so errors show in UI and submit only runs when valid)
async function onValidating() {
  await validate()

  const firstErrorField = Object.keys(errors.value)[0]
  if (firstErrorField) {
    const firstErrorFieldElement = document.querySelector(`[name=${firstErrorField}]`) as HTMLElement
    if (firstErrorFieldElement) {
      firstErrorFieldElement.focus()
      firstErrorFieldElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  onSearchSubmit()
}

// When project ID prefix or project name filter become valid (per Zod regex), trigger search
function getCurrentFormValues(): SearchFormValues {
  return {
    status: statusValue.value ?? 'any',
    ngi_project_id: projectIdPrefixValue.value ?? undefined,
    project_name_filter: projectNameFilterValue.value ?? undefined,
    application_filter: applicationFilterValue.value ?? undefined
  }
}

const searchTriggerDebounce = useDebounceFn(() => {
  validate().then((result) => {
    if (result.valid) {
      applySearchValues(getCurrentFormValues())
    }
  })
}, 400)

watch([projectIdPrefixValue, projectNameFilterValue], () => {
  searchTriggerDebounce()
}, { deep: true })
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
      card="outline-gray"
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
        >
          <NInput
            :model-value="projectIdPrefixValue ?? ''"
            placeholder="e.g. P12345"
            @update:model-value="(v: unknown) => setProjectIdPrefixValue((v as string) ?? '')"
          />
        </NFormField>
        <NFormField
          name="project_name_filter"
          label="Project Name"
          class="min-w-[10rem]"
        >
          <NInput
            :model-value="projectNameFilterValue ?? ''"
            placeholder="e.g. P.Långstrump_45_11"
            @update:model-value="(v: unknown) => setProjectNameFilterValue((v as string) ?? '')"
          />
        </NFormField>
        <NFormField
          name="application_filter"
          label="Application"
          class="min-w-[10rem]"
        >
          <NInput
            :model-value="applicationFilterValue ?? ''"
            placeholder="Filter by application"
            @update:model-value="(v: unknown) => setApplicationFilterValue((v as string) ?? '')"
          />
        </NFormField>
        <NButton type="submit">
          Search
        </NButton>
      </form>
    </NCard>

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
      v-else-if="responseData && responseData.available"
      class="mt-6"
    >
      <TableProjectSummaryDisplay
        :projects="responseData.items"
        :loading="isLoading"
      />
    </div>
    <div
      v-else-if="responseData && !responseData.available"
      class="rounded border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      <p class="font-medium">
        Projects database is not available.
      </p>
    </div>
  </main>
</template>
