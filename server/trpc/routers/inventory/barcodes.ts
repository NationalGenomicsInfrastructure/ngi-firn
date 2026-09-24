/*
 * Inventory Barcodes Router - Table of Contents
 * *********************************************
 *
 * BARCODE QUERIES (authedProcedure):
 * resolveBarcodes - Interpret a scanned set into a reviewable plan, without writing anything
 *
 * BARCODE MUTATIONS (firnUserProcedure):
 * applyBarcodeScan - Re-resolve a scanned set server-side and execute it
 * assignBarcode - Issue a fresh barcode for an existing item, container or equipment
 *
 * These procedures use `firnUserProcedure` so the acting user reaches the action
 * log. The tRPC context populates `ctx.firnUser` from either a session cookie or an
 * `Authorization` header token, so a lab tablet driving a scanner authenticates
 * through exactly the same procedures as the web UI.
 */

import { createTRPCRouter, authedProcedure, firnUserProcedure } from '../../init'
import {
  resolveBarcodesSchema,
  applyBarcodeScanSchema,
  assignBarcodeSchema
} from '~~/schemas/inventory/barcode'
import type { BarcodeScanPlan, BarcodeScanResult } from '~~/types/inventory'

export const barcodesRouter = createTRPCRouter({

  // Barcode queries

  /*
   * Interpret a scanned set without writing anything.
   *
   * Exposed separately from the mutation so the UI can re-resolve after every
   * additional scan and show the user what would happen before they commit.
   */
  resolveBarcodes: authedProcedure
    .input(resolveBarcodesSchema)
    .query(async ({ input }): Promise<BarcodeScanPlan> => {
      const { BarcodeScanService } = await import('../../../crud/inventory/barcode-scan.server')
      return await BarcodeScanService.resolveScan(input.codes)
    }),

  // Barcode mutations

  /*
   * Execute a scanned set.
   *
   * Only the raw codes are accepted, never a plan built by the client: statuses can
   * change between review and confirmation, and trusting a submitted plan would let
   * a forged one bypass the status/action state machine. The service therefore
   * re-resolves and returns the plan it actually acted on.
   */
  applyBarcodeScan: firnUserProcedure
    .input(applyBarcodeScanSchema)
    .mutation(async ({ input, ctx }): Promise<BarcodeScanResult> => {
      if (!ctx.firnUser) throw new Error('User context is required to apply a barcode scan.')
      const { BarcodeScanService } = await import('../../../crud/inventory/barcode-scan.server')
      return await BarcodeScanService.applyScan(input.codes, ctx.firnUser, input.logComment)
    }),

  /*
   * Issue a fresh barcode for an entity that has none, or re-issue one on request.
   *
   * Re-issuing stops the already printed label from resolving, so it requires the
   * explicit `replaceExisting` opt-in and is recorded in the entity's action log.
   */
  assignBarcode: firnUserProcedure
    .input(assignBarcodeSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.firnUser) throw new Error('User context is required to assign a barcode.')
      const { BarcodeService } = await import('../../../crud/inventory/barcodes.server')
      return await BarcodeService.assignBarcode(input, ctx.firnUser)
    })
})
