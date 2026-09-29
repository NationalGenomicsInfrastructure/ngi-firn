import { useQuery as useQueryColada } from '@pinia/colada'
import type { BarcodeScanPlan, BarcodeScanRejection, BarcodeScanTarget } from '~~/types/inventory'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import { BARCODE_FOR_ACTION, MAX_SCAN_BATCH, normalizeBarcode, parseBarcode } from '~~/schemas/inventory/barcode'
import { barcodeScanPlanQuery } from '~/utils/queries/inventory/barcodes'

/*
 * Scan basket.
 * ***********
 *
 * Collects scanned codes on the scanner page and keeps the server's interpretation of
 * the set in step with every addition, so the user sees what will happen before they
 * approve. Create it once on the page: the tab panels unmount when hidden, and the
 * basket must survive a detour to the Info tab.
 *
 * The action is held apart from the entity codes. The server refuses a set with two
 * different action cards, so a single slot — replaced by a newly scanned card or a
 * tapped action button — makes that error impossible rather than merely reported.
 */

/* The part a scanned code plays in the resolved plan, used to style its basket row. */
export type ScanBasketRole
  = | { kind: 'target', target: BarcodeScanTarget }
    | { kind: 'location', relocating: boolean }
    | { kind: 'ignored-location' }
    | { kind: 'rejected', rejection: BarcodeScanRejection }
    /* Resolved, but the plan gave the code no role — e.g. a move still missing its destination. */
    | { kind: 'unassigned', message: string }
    | { kind: 'pending' }

const RELOCATING_ACTIONS: readonly InventoryActionType[] = ['move', 'locate']

export function useScanBasket() {
  const { showWarning, showInfo } = useFirnToast()

  /* Entity (and external-label) codes in scan order; order picks a move destination. */
  const entityCodes = ref<string[]>([])
  /* The explicit action, or null for the default checkout/return toggle. */
  const action = ref<InventoryActionType | null>(null)
  const logComment = ref('')

  const relocating = computed(() => action.value !== null && RELOCATING_ACTIONS.includes(action.value))

  /* What the server resolves: the entity codes plus the action's card, if any. */
  const resolvedCodes = computed(() => action.value
    ? [...entityCodes.value, BARCODE_FOR_ACTION[action.value]]
    : [...entityCodes.value])

  /*
   * Screen a code locally before it enters the basket. Misreads, login tokens and
   * duplicates never reach the server; an action card switches the action instead of
   * being listed as a row.
   */
  function addCode(raw: string): void {
    const parsed = parseBarcode(raw)

    if (parsed.kind === 'invalid') {
      if (parsed.value) showWarning(parsed.reason, 'Barcode not added')
      return
    }

    if (parsed.kind === 'action') {
      setAction(parsed.action)
      return
    }

    if (entityCodes.value.includes(parsed.value)) {
      showInfo(`"${parsed.value}" is already in the basket.`, 'Already scanned')
      return
    }

    if (entityCodes.value.length >= MAX_SCAN_BATCH) {
      showWarning(`A basket holds at most ${MAX_SCAN_BATCH} barcodes. Apply or clear it first.`, 'Basket full')
      return
    }

    entityCodes.value = [...entityCodes.value, parsed.value]
  }

  function removeCode(code: string): void {
    const normalized = normalizeBarcode(code)
    entityCodes.value = entityCodes.value.filter(existing => existing !== normalized)
  }

  function setAction(next: InventoryActionType | null): void {
    action.value = next
  }

  function setLogComment(value: string): void {
    logComment.value = value
  }

  function clear(): void {
    entityCodes.value = []
    action.value = null
    logComment.value = ''
  }

  const { state, asyncStatus, refetch } = useQueryColada(() => ({
    ...barcodeScanPlanQuery(resolvedCodes.value),
    enabled: entityCodes.value.length > 0,
    // Keep the previous plan on screen while the grown set re-resolves, so rows do
    // not flash back to "pending" on every scan.
    placeholderData: (previous: BarcodeScanPlan | undefined) => previous
  }))

  const plan = computed<BarcodeScanPlan | null>(() =>
    entityCodes.value.length > 0 && state.value.data ? state.value.data : null)
  const planError = computed(() => state.value.status === 'error' ? state.value.error : null)
  const isResolving = computed(() => asyncStatus.value === 'loading')

  const executableCount = computed(() => plan.value?.targets.filter(t => t.executable).length ?? 0)
  const blockedCount = computed(() => plan.value?.targets.filter(t => !t.executable).length ?? 0)

  /* The role of one basket row, derived from the latest plan. */
  function roleOf(code: string): ScanBasketRole {
    const current = plan.value
    if (!current) return isResolving.value ? { kind: 'pending' } : unassigned(null)

    const target = current.targets.find(t => t.code === code)
    if (target) return { kind: 'target', target }
    if (current.contextCode === code) return { kind: 'location', relocating: relocating.value }
    if (current.ignoredLocationCodes.includes(code)) return { kind: 'ignored-location' }
    const rejection = current.rejected.find(r => r.code === code)
    if (rejection) return { kind: 'rejected', rejection }
    // A code the shown plan has not seen yet is still on its way to the server.
    if (isResolving.value) return { kind: 'pending' }
    return unassigned(current)
  }

  function unassigned(current: BarcodeScanPlan | null): ScanBasketRole {
    if (relocating.value && !current?.contextCode) {
      return { kind: 'unassigned', message: 'Waiting for a destination: scan where these should go, last.' }
    }
    return { kind: 'unassigned', message: current?.error ?? 'Not part of this action.' }
  }

  return {
    entityCodes: readonly(entityCodes),
    action: readonly(action),
    logComment: readonly(logComment),
    relocating,
    resolvedCodes,
    plan,
    planError,
    isResolving,
    executableCount,
    blockedCount,
    addCode,
    removeCode,
    setAction,
    setLogComment,
    clear,
    roleOf,
    refetch
  }
}

export type ScanBasket = ReturnType<typeof useScanBasket>
