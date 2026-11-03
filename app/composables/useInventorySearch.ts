import { useQuery } from '@pinia/colada'
import type { InventorySearchInput } from '~~/schemas/inventory/search'
import type { SearchEntityKind } from '~~/types/search'
import type { InventoryStatusType } from '~~/schemas/inventory/metadata'
import { inventorySearchQuery, searchStatusQuery } from '~/utils/queries/inventory/search'

/* Default page sizes mirror the Zod schema defaults; kept here so the UI can reason about them. */
const PROJECT_PAGE_SIZE = 5
const PROJECT_INVENTORY_PAGE_SIZE = 10
const INVENTORY_PAGE_SIZE = 20
const DEBOUNCE_MS = 350

/*
 * Reactive state, debouncing and the Pinia Colada query behind the global inventory search page.
 *
 * The raw query text is debounced before it reaches the server; filter toggles apply immediately.
 * Changing the query or any filter resets both sections' pagination to the first page, while the
 * "load more" actions advance a single section's offset without disturbing the other. The query
 * only runs once there is at least one non-whitespace character, so an empty box shows guidance
 * rather than firing a request.
 */
export function useInventorySearch() {
  const queryInput = ref('')
  const debouncedQuery = ref('')

  const kinds = ref<SearchEntityKind[]>([])
  const statuses = ref<InventoryStatusType[]>([])
  const roomSlug = ref<string | undefined>(undefined)
  const projectId = ref<string | undefined>(undefined)

  const projectOffset = ref(0)
  const inventoryOffset = ref(0)

  function resetPagination() {
    projectOffset.value = 0
    inventoryOffset.value = 0
  }

  const applyQueryDebounced = useDebounceFn((value: string) => {
    debouncedQuery.value = value.trim()
    resetPagination()
  }, DEBOUNCE_MS)

  watch(queryInput, value => applyQueryDebounced(value))
  watch([kinds, statuses, roomSlug, projectId], () => resetPagination(), { deep: true })

  const appliedInput = computed<InventorySearchInput>(() => ({
    query: debouncedQuery.value,
    kinds: kinds.value,
    statuses: statuses.value,
    roomSlug: roomSlug.value,
    projectId: projectId.value,
    projectOffset: projectOffset.value,
    projectLimit: PROJECT_PAGE_SIZE,
    projectInventoryLimit: PROJECT_INVENTORY_PAGE_SIZE,
    inventoryOffset: inventoryOffset.value,
    inventoryLimit: INVENTORY_PAGE_SIZE
  }))

  const hasQuery = computed(() => debouncedQuery.value.length >= 1)

  const { state, asyncStatus } = useQuery(() => ({
    ...inventorySearchQuery(appliedInput.value),
    enabled: hasQuery.value
  }))

  const { state: statusState } = useQuery(searchStatusQuery)

  const isLoading = computed(() => asyncStatus.value === 'loading')
  const isError = computed(() => state.value.status === 'error')
  const error = computed(() => (state.value.status === 'error' ? state.value.error : undefined))
  const results = computed(() => (state.value.status === 'success' ? state.value.data : undefined))

  /* Prefer the freshness carried on the live results; fall back to the standalone status query. */
  const freshness = computed(() => results.value?.freshness ?? (statusState.value.status === 'success' ? statusState.value.data : undefined))

  const projectGroups = computed(() => results.value?.projectGroups)
  const directMatches = computed(() => results.value?.directMatches)
  const projectLookup = computed(() => results.value?.projectLookup ?? {})

  function loadMoreProjects() {
    projectOffset.value += PROJECT_PAGE_SIZE
  }

  function loadMoreInventory() {
    inventoryOffset.value += INVENTORY_PAGE_SIZE
  }

  function toggleKind(kind: SearchEntityKind) {
    kinds.value = kinds.value.includes(kind)
      ? kinds.value.filter(k => k !== kind)
      : [...kinds.value, kind]
  }

  function toggleStatus(status: InventoryStatusType) {
    statuses.value = statuses.value.includes(status)
      ? statuses.value.filter(s => s !== status)
      : [...statuses.value, status]
  }

  function reset() {
    queryInput.value = ''
    debouncedQuery.value = ''
    kinds.value = []
    statuses.value = []
    roomSlug.value = undefined
    projectId.value = undefined
    resetPagination()
  }

  return {
    queryInput,
    kinds,
    statuses,
    roomSlug,
    projectId,
    hasQuery,
    isLoading,
    isError,
    error,
    results,
    freshness,
    projectGroups,
    directMatches,
    projectLookup,
    toggleKind,
    toggleStatus,
    loadMoreProjects,
    loadMoreInventory,
    reset,
    pageSizes: {
      projects: PROJECT_PAGE_SIZE,
      projectInventory: PROJECT_INVENTORY_PAGE_SIZE,
      inventory: INVENTORY_PAGE_SIZE
    }
  }
}
