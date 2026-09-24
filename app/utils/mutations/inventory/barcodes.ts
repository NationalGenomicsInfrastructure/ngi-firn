import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { BarcodeScanResult } from '~~/types/inventory'
import type { ApplyBarcodeScanInput, AssignBarcodeInput } from '~~/schemas/inventory/barcode'
import { INVENTORY_BARCODE_QUERY_KEYS } from '~/utils/queries/inventory/barcodes'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_EQUIPMENT_QUERY_KEYS } from '~/utils/queries/inventory/equipment'

const { showSuccess, showError, showWarning } = useFirnToast()

/*
 * Invalidate everything a scan could plausibly have touched.
 *
 * Unlike a single-entity edit, one scan can alter several items and containers at
 * once and can relocate them between parents, which changes list membership and the
 * capacity counters of both the source and the destination. Reconstructing exactly
 * which cached lists became stale would mean re-deriving the hierarchy on the
 * client, so the whole inventory sub-tree is invalidated instead. Scans are
 * infrequent and deliberate, so the extra refetching is not worth optimising away.
 */
function invalidateScannedEntities() {
  const queryCache = useQueryCache()
  queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
  queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
  queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.root })
  queryCache.invalidateQueries({ key: INVENTORY_BARCODE_QUERY_KEYS.root })
}

/*
 * Apply a scanned set.
 *
 * Deliberately has no optimistic update: the server re-resolves the codes before
 * executing, so the authoritative outcome is only known from the response. Writing
 * a guessed result into the cache first would show the user an action that the
 * state machine may well have refused.
 */
export const applyBarcodeScan = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: ApplyBarcodeScanInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.barcodes.applyBarcodeScan.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Scan could not be applied')
    },
    onSuccess(result: BarcodeScanResult) {
      if (result.plan.error) {
        showError(result.plan.error, 'Nothing was applied')
        return
      }

      const changed = result.applied.reduce((total, group) => total + group.slugs.length, 0)

      if (result.failures.length > 0) {
        const distinctErrors = [...new Set(result.failures.map(failure => failure.error))]
        showWarning(
          `${changed} updated, ${result.failures.length} failed. ${distinctErrors.join(' ')}`,
          'Scan partly applied'
        )
        return
      }

      if (changed === 0) {
        const blocked = result.plan.targets.find(target => !target.executable)
        showWarning(
          blocked?.reason ?? 'Nothing in the scanned set could be acted upon.',
          'Nothing to do'
        )
        return
      }

      const summary = result.applied
        .map(group => `${group.slugs.length} ${group.action.replace('_', ' ')}`)
        .join(', ')
      showSuccess(`${summary}.`, 'Scan applied')
    },
    onSettled() {
      invalidateScannedEntities()
    }
  })
  return { applyBarcodeScan: mutate, ...mutation }
})

/*
 * Issue or re-issue a barcode for a single entity.
 *
 * Also has no optimistic update, since the barcode is generated server-side and
 * cannot be predicted here.
 */
export const assignBarcode = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: AssignBarcodeInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.barcodes.assignBarcode.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Barcode could not be issued')
    },
    onSuccess(result: { barcode: string, previousBarcode: string | null }) {
      if (result.previousBarcode) {
        showWarning(
          `New barcode ${result.barcode}. The printed label ${result.previousBarcode} no longer works and should be replaced.`,
          'Barcode re-issued'
        )
      }
      else {
        showSuccess(`Barcode ${result.barcode} assigned.`, 'Barcode issued')
      }
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      if (input.entityKind === 'item') {
        queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(input.slug) })
      }
      else if (input.entityKind === 'container') {
        queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(input.slug) })
      }
      else {
        queryCache.invalidateQueries({ key: INVENTORY_EQUIPMENT_QUERY_KEYS.detailBySlug(input.slug) })
      }
      // The old code must stop resolving in any cached scan plan.
      queryCache.invalidateQueries({ key: INVENTORY_BARCODE_QUERY_KEYS.root })
    }
  })
  return { assignBarcode: mutate, ...mutation }
})
