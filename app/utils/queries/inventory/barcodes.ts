import { defineQueryOptions } from '@pinia/colada'
import type { BarcodeScanPlan } from '~~/types/inventory'
import type { BarcodeEntityKind } from '~~/schemas/inventory/barcode'

/*
 * Key factory for the barcode domain.
 *
 * A scan plan is keyed by the scanned set in scan order. Order is not cosmetic: a
 * move or locate takes the last location scanned as its destination, so the same
 * codes in a different order can resolve to a different plan. Sorting the key would
 * let a re-ordered basket show a cached plan with the wrong destination.
 */
export const INVENTORY_BARCODE_QUERY_KEYS = {
  root: ['inventory', 'barcodes'] as const,
  scan: (codes: string[]) =>
    [...INVENTORY_BARCODE_QUERY_KEYS.root, 'scan', ...codes] as const,
  lookup: (code: string) =>
    [...INVENTORY_BARCODE_QUERY_KEYS.root, 'lookup', code] as const
} as const

/*
 * Interpret a scanned set without writing anything.
 *
 * Kept as a query rather than folded into the apply mutation so the UI can
 * re-resolve after every additional scan and show the user what would happen
 * before they commit to it.
 */
export const barcodeScanPlanQuery = defineQueryOptions(
  (codes: string[]) => ({
    key: INVENTORY_BARCODE_QUERY_KEYS.scan(codes),
    query: (): Promise<BarcodeScanPlan> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.barcodes.resolveBarcodes.query({ codes })
    }
  })
)

/*
 * Identify the entity behind a single code. Only kind and slug come back; the entity
 * itself is read through the regular detail queries so it shares their cache.
 */
export const barcodeLookupQuery = defineQueryOptions(
  (code: string) => ({
    key: INVENTORY_BARCODE_QUERY_KEYS.lookup(code),
    query: (): Promise<{ entityKind: BarcodeEntityKind, slug: string } | null> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.barcodes.lookupBarcode.query({ code })
    }
  })
)
