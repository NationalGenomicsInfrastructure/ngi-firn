// =============================================================================================
// Types for barcode detection and reading (used in Firn)
// =============================================================================================

import type { InventoryStatusType, InventoryActionType } from '../schemas/inventory/metadata'
import type { SerializedEntityRef } from './inventory'

// Barcode detection tracking

export type BarcodeDetection = {
  id: string
  code: string
  format: string
  count: number
  // geometry from latest detection
  lastBox?: number[][]
  lastLine?: { x: number, y: number }[]
  // small ring buffer of recent samples
  samples: Array<{
    box?: number[][]
    line?: { x: number, y: number }[]
  }>
}

// Zxing wrapper types

// Type for an exposed ZxingReader instance
export type ZxingReaderInstance = {
  toggleTorch: () => Promise<void>
  switchCamera: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  togglePause: () => Promise<void>
  state: { running: boolean, usingBack: boolean, torch: boolean }
}

export type CornerPoint = { x: number, y: number }
export type DetectedCode = {
  rawValue: string
  format?: string
  corners?: CornerPoint[]
}

export type QrScannerEvents = {
  /** Fired whenever one or more barcodes are detected on a frame */
  detect: DetectedCode[]
  /** Fired when a fatal error occurs (camera/permission/decoder) */
  error: Error
}

export type ScannerState = {
  running: boolean
  usingBack: boolean
  torch: boolean
}

export type ScannerOptions = {
  /** Prefered formats; used for BarcodeDetector if available. */
  formats?: string[]
  /** Process every Nth frame (throttle). Default: 1 (every frame). */
  frameInterval?: number
  /** Set true to mirror overlay when using front camera. */
  mirrorWhenUser?: boolean
}

// Define the barcode options interface based on JsBarcode documentation
export type BarcodeOptions = {
  format?: string
  width?: number
  height?: number
  displayValue?: boolean
  font?: string
  fontOptions?: string
  fontPosition?: string
  fontSize?: number
  textMargin?: number
  textAlign?: string
  textPosition?: string
  text?: string
  background?: string
  lineColor?: string
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  valid?: (valid: boolean) => void
}

/*
 * BARCODE SCANNING
 * ****************
 *
 * A scanned set of barcodes is interpreted rather than executed blindly: the set
 * is split into action targets, an optional location context, and an optional
 * action card, and the result is offered for review before anything is written.
 */

/* Why a scanned code could not be turned into an actionable target. */
export type BarcodeScanRejectionReason
  = | 'invalid'
    | 'unknown'
    | 'ambiguous'

/* A scanned code that could not be resolved or acted upon, with an explanation. */
export interface BarcodeScanRejection {
  code: string
  reason: BarcodeScanRejectionReason
  message: string
}

/* Non-fatal observations worth surfacing before the user confirms. */
export type BarcodeScanWarningKind = 'parent_mismatch' | 'duplicate_scan' | 'context_ignored'

export interface BarcodeScanWarning {
  kind: BarcodeScanWarningKind
  message: string
  /* The entity the warning concerns, when it is entity-specific. */
  slug: string | null
}

/* One entity resolved from the scanned set, with the action inferred for it. */
export interface BarcodeScanTarget {
  code: string
  slug: string
  name: string
  kind: 'container' | 'item'
  status: InventoryStatusType
  /* The action that would be applied. Null when the entity cannot be acted upon. */
  proposedAction: InventoryActionType | null
  /* Whether this target would actually be included when the plan is applied. */
  executable: boolean
  /* Why the target is not executable, when it is not. */
  reason: string | null
  /* Current parent, used to explain relocations and parent mismatches. */
  parentRef: SerializedEntityRef | null
}

/*
 * The interpreted result of one scanned set.
 *
 * `action` is null for the default checkout/return toggle, where the operation is
 * decided per target from its current status rather than being uniform.
 */
export interface BarcodeScanPlan {
  /* The explicit action card found in the set, or null for the default toggle. */
  action: InventoryActionType | null
  /* Whether the action came from a scanned card rather than being inferred. */
  explicitAction: boolean
  /* The location context: scanned equipment, or a container that is an ancestor. */
  context: SerializedEntityRef | null
  /* The scanned code that resolved to `context`, so a client can label that code's row. */
  contextCode: string | null
  /*
   * Location codes that were resolved but play no role: extra locations beyond the one
   * chosen as context, or equipment scanned before a move/locate destination. Reported
   * so every scanned code can be accounted for, not just the ones that were used.
   */
  ignoredLocationCodes: string[]
  targets: BarcodeScanTarget[]
  rejected: BarcodeScanRejection[]
  warnings: BarcodeScanWarning[]
  /* Blocking problem that prevents the whole set from being applied. */
  error: string | null
}

/* The outcome of applying a scan plan. */
export interface BarcodeScanResult {
  /* The plan as re-resolved at execution time, not the one the client reviewed. */
  plan: BarcodeScanPlan
  /* Slugs successfully acted upon, grouped by the action that was applied. */
  applied: { action: InventoryActionType, slugs: string[] }[]
  failures: { slug: string, error: string }[]
}
