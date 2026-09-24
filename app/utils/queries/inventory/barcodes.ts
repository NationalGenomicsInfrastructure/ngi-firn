import { defineQueryOptions } from '@pinia/colada'
import type { BarcodeScanPlan } from '~~/types/inventory'

/*
 * Key factory for the barcode domain.
 *
 * A scan plan is keyed by the scanned set itself. The codes are sorted so that the
 * same physical set resolves to one cache entry regardless of the order they were
 * scanned in — the resolver only treats order as meaningful for picking the
 * destination of a relocating scan, and that case re-resolves on the server anyway.
 */
export const INVENTORY_BARCODE_QUERY_KEYS = {
  root: ['inventory', 'barcodes'] as const,
  scan: (codes: string[]) =>
    [...INVENTORY_BARCODE_QUERY_KEYS.root, 'scan', ...[...codes].sort()] as const
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
