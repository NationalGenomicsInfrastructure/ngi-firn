import { toTypedSchema } from '@vee-validate/zod'
import { useQuery } from '@pinia/colada'
import * as z from 'zod'
import type { ListProjectsSummaryInputSchema } from '~~/schemas/projects'
import { projectSummariesQuery } from '~/utils/queries/projects'

export type ProjectSearchStatus = 'any' | 'open' | 'closed'

export interface ProjectSearchFormValues {
  status: ProjectSearchStatus
  ngi_project_id?: string
  project_name_filter?: string
  application_filter?: string
}

// How deep the server scans for name/application matches per "Retrieve more" click.
const SCAN_STEP = 1000

const searchFormSchema = toTypedSchema(z.object({
  status: z.enum(['any', 'open', 'closed']),
  ngi_project_id: z.string().optional().refine(v => !v || /^P[0-9]+$/.test(v), { message: 'P followed by digits (e.g. P1, P00017)' }),
  project_name_filter: z.string().optional().refine(
    v => !v || /^[\p{Lu}]\.[\p{L}]+(?:_[0-9]{2}(?:_[0-9]+)?)?$/u.test(v),
    { message: 'Format: Capital.Name_YY_NN' }
  ),
  application_filter: z.string().optional()
}))

/**
 * Form state, debounced validation and the summaries query behind the project search.
 * Shared by the projects overview page and the "link to project" dialog.
 */
export function useProjectSearch(options: { enabled?: MaybeRefOrGetter<boolean> } = {}) {
  const { handleSubmit, validate, errors, resetForm } = useForm({
    validationSchema: searchFormSchema,
    initialValues: {
      status: 'any' as const,
      ngi_project_id: '',
      project_name_filter: '',
      application_filter: ''
    }
  })

  // Bind fields explicitly so form state updates on input (NFormField + NSelect/NInput may not sync otherwise)
  const { value: statusValue, setValue: setStatusValue } = useField<ProjectSearchStatus>('status')
  const { value: projectIdPrefixValue, setValue: setProjectIdPrefixValue } = useField<string>('ngi_project_id')
  const { value: projectNameFilterValue, setValue: setProjectNameFilterValue } = useField<string>('project_name_filter')
  const { value: applicationFilterValue, setValue: setApplicationFilterValue } = useField<string>('application_filter')

  // Applied search params (set on submit or when the inputs become valid); the query uses these
  const searchParams = ref<ListProjectsSummaryInputSchema & { status?: 'open' | 'closed' }>({})

  // Raised on demand via "Retrieve more"; reset to undefined (server default) on every new search.
  const scanLimit = ref<number | undefined>(undefined)

  const queryParams = computed<ListProjectsSummaryInputSchema>(() => {
    const p = searchParams.value
    const out: ListProjectsSummaryInputSchema = {}
    if (p.status === 'open' || p.status === 'closed') out.status = p.status
    if (p.ngi_project_id?.trim()) out.ngi_project_id = p.ngi_project_id.trim()
    if (p.project_name_filter?.trim()) out.project_name_filter = p.project_name_filter.trim()
    if (p.application_filter?.trim()) out.application_filter = p.application_filter.trim()
    if (scanLimit.value != null) out.scan_limit = scanLimit.value
    if (p.limit != null) out.limit = p.limit
    if (p.skip != null) out.skip = p.skip
    return out
  })

  const { state, asyncStatus } = useQuery(() => ({
    ...projectSummariesQuery(queryParams.value),
    enabled: toValue(options.enabled ?? true)
  }))

  const isLoading = computed(() => asyncStatus.value === 'loading')
  const isError = computed(() => state.value.status === 'error')
  const error = computed(() => state.value.status === 'error' ? state.value.error : undefined)
  const responseData = computed(() => state.value.status === 'success' ? state.value.data : undefined)
  // True when a name/application filter scan filled its window; more matches may exist beyond the shown set.
  const scanTruncated = computed(() => responseData.value?.available === true && responseData.value.scan_truncated === true)
  // True when the scan has reached its hard ceiling; we can no longer offer to scan deeper.
  const scanAtMax = computed(() => responseData.value?.available === true && responseData.value.scan_at_max === true)

  // "Retrieve more": scan one step deeper. The server clamps to its ceiling and signals scan_at_max when reached.
  function retrieveMore() {
    scanLimit.value = (scanLimit.value ?? 0) + SCAN_STEP
  }

  function applySearchValues(values: ProjectSearchFormValues) {
    // New search criteria: start scanning shallow again.
    scanLimit.value = undefined
    searchParams.value = {
      ...(values.status && values.status !== 'any' && { status: values.status }),
      ...(values.ngi_project_id?.trim() && { ngi_project_id: values.ngi_project_id.trim() }),
      ...(values.project_name_filter?.trim() && { project_name_filter: values.project_name_filter.trim() }),
      ...(values.application_filter?.trim() && { application_filter: values.application_filter.trim() })
    }
  }

  const onSearchSubmit = handleSubmit((values: ProjectSearchFormValues) => {
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

  function getCurrentFormValues(): ProjectSearchFormValues {
    return {
      status: statusValue.value ?? 'any',
      ngi_project_id: projectIdPrefixValue.value ?? undefined,
      project_name_filter: projectNameFilterValue.value ?? undefined,
      application_filter: applicationFilterValue.value ?? undefined
    }
  }

  // Debounce search trigger to prevent API calls with invalid input into the search fields.
  const searchTriggerDebounce = useDebounceFn(() => {
    validate().then((result) => {
      if (result.valid) {
        applySearchValues(getCurrentFormValues())
      }
    })
  }, 400)

  watch([projectIdPrefixValue, projectNameFilterValue, applicationFilterValue], () => {
    searchTriggerDebounce()
  }, { deep: true })

  function reset() {
    resetForm()
    scanLimit.value = undefined
    searchParams.value = {}
  }

  return {
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
    onValidating,
    reset
  }
}
