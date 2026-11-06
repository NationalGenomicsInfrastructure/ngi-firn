import { useQuery } from '@pinia/colada'
import type { ProjectSearchResultSchema, SearchProjectsInputSchema } from '~~/schemas/projects'
import { projectFilterOptionsQuery, projectSearchQuery } from '~/utils/queries/projects'

export type ProjectSearchStatus = 'any' | 'open' | 'closed'

const DEBOUNCE_MS = 350
// Results per request; "Show more" widens the window by one page at a time.
const PAGE_SIZE = 100
// CouchDB fallback only: how much deeper each "Show more" scans the summary view.
const SCAN_STEP = 1000

/**
 * Form state, debounced query and the project-search query behind `/projects` and the
 * "link to project" dialog.
 *
 * One free-text box (ID, name and everything else that is indexed) is combined with structured,
 * multi-select filters. The text is debounced before it reaches the server; filter changes apply
 * immediately. Any change to the criteria resets the result window. When the search engine is
 * unavailable the server answers from CouchDB and reports `source: 'couchdb'` (see `isDegraded`).
 */
export function useProjectSearch(options: { enabled?: MaybeRefOrGetter<boolean> } = {}) {
  const queryInput = ref('')
  const debouncedQuery = ref('')
  const status = ref<ProjectSearchStatus>('any')
  const applications = ref<string[]>([])
  const coordinators = ref<string[]>([])
  const labResponsibles = ref<string[]>([])
  const bioinfoResponsibles = ref<string[]>([])

  // Number of "Show more" clicks since the criteria last changed.
  const extraPages = ref(0)

  const applyQueryDebounced = useDebounceFn((value: string) => {
    debouncedQuery.value = value.trim()
    extraPages.value = 0
  }, DEBOUNCE_MS)
  watch(queryInput, value => applyQueryDebounced(value))
  watch([status, applications, coordinators, labResponsibles, bioinfoResponsibles], () => {
    extraPages.value = 0
  }, { deep: true })

  const appliedInput = computed<SearchProjectsInputSchema>(() => ({
    query: debouncedQuery.value,
    ...(status.value !== 'any' && { status: status.value }),
    ...(applications.value.length > 0 && { applications: applications.value }),
    ...(coordinators.value.length > 0 && { coordinators: coordinators.value }),
    ...(labResponsibles.value.length > 0 && { labResponsibles: labResponsibles.value }),
    ...(bioinfoResponsibles.value.length > 0 && { bioinfoResponsibles: bioinfoResponsibles.value }),
    limit: PAGE_SIZE * (extraPages.value + 1),
    ...(extraPages.value > 0 && { scan_limit: extraPages.value * SCAN_STEP })
  }))

  const enabled = computed(() => toValue(options.enabled ?? true))

  const { state, asyncStatus } = useQuery(() => ({
    ...projectSearchQuery(appliedInput.value),
    enabled: enabled.value,
    // Keep the previous results on screen while a refined search is in flight.
    placeholderData: (previous: ProjectSearchResultSchema | undefined) => previous
  }))

  const { state: filterOptionsState } = useQuery(() => ({
    ...projectFilterOptionsQuery,
    enabled: enabled.value
  }))

  const isLoading = computed(() => asyncStatus.value === 'loading')
  const isError = computed(() => state.value.status === 'error')
  const error = computed(() => state.value.status === 'error' ? state.value.error : undefined)
  const responseData = computed(() => state.value.data)
  const results = computed(() => responseData.value?.available ? responseData.value : undefined)
  const filterOptions = computed(() =>
    filterOptionsState.value.status === 'success' && filterOptionsState.value.data.available
      ? filterOptionsState.value.data
      : undefined
  )

  // True when results come from the CouchDB fallback (search engine down or index still building).
  const isDegraded = computed(() => results.value?.source === 'couchdb')
  const hasActiveCriteria = computed(() => Object.keys(appliedInput.value).some(key => !['query', 'limit', 'scan_limit'].includes(key)) || debouncedQuery.value.length > 0)
  // The fallback cannot scan deeper once it has hit its ceiling.
  const canShowMore = computed(() => !!results.value?.hasMore && !results.value.scan_at_max)

  function showMore() {
    extraPages.value += 1
  }

  function reset() {
    queryInput.value = ''
    debouncedQuery.value = ''
    status.value = 'any'
    applications.value = []
    coordinators.value = []
    labResponsibles.value = []
    bioinfoResponsibles.value = []
    extraPages.value = 0
  }

  return {
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
  }
}
