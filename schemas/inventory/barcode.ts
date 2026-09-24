import { z } from 'zod'
import type { InventoryActionType } from './metadata'

// Firn inventory barcodes.
//
// Single source of truth for the barcode model shared by the server (generation,
// uniqueness checks, scan resolution) and the client (local validation, display,
// label rendering). Items, containers and storage equipment each carry a unique,
// self-describing code; a fourth prefix encodes a standalone action card.
//
// Layout: <prefix><8 payload chars><1 check char>, e.g. "fi7k2m9xq4c".
//
// The prefix makes a scanned code self-describing, so the scanner knows what kind
// of entity it is looking at before any database round trip. The check character
// lets a misread be rejected locally. Codes are encoded as Code 128, matching the
// symbology already used for the "ft…" login tokens — the distinct prefix keeps
// token and inventory codes from ever being confused on a shared scanning surface.
//
// Rooms deliberately have no barcode: they are hierarchy roots, not handled objects.

/* Lowercase base36. Scanned input is normalised to lowercase before parsing. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = ALPHABET.length

/* Number of random characters between the prefix and the check character. */
export const BARCODE_PAYLOAD_LENGTH = 8

/*
 * Weights used by the check character, all coprime with 36.
 *
 * Coprimality is what makes the check character useful: for a weight `w` coprime
 * with 36, a single substituted character shifts the weighted sum by
 * `(a' - a) * w`, which is only ≡ 0 (mod 36) when `a' === a`. Every single-character
 * misread is therefore caught. Had the weights simply been the positions 1, 2, 3, …
 * a substitution such as position 6 shifting by 6 would slip through unnoticed.
 *
 * Adjacent transpositions are caught whenever `(a - b) * (w[i+1] - w[i])` is not a
 * multiple of 36, which covers the majority but not all pairs. Full transposition
 * coverage needs a prime modulus, which a 36-character alphabet cannot provide
 * without an out-of-alphabet check symbol.
 */
const CHECK_WEIGHTS = [1, 5, 7, 11, 13, 17, 19, 23, 25, 29, 31, 35]

/* The kinds of entity that carry a barcode. Rooms are excluded by design. */
export const barcodeEntityKindSchema = z.enum(['item', 'container', 'equipment'])
export type BarcodeEntityKind = z.infer<typeof barcodeEntityKindSchema>

/* Two-letter prefix per entity kind. "f" for Firn, plus the entity initial. */
export const BARCODE_ENTITY_PREFIXES: Record<BarcodeEntityKind, string> = {
  item: 'fi',
  container: 'fc',
  equipment: 'fe'
}

/* Prefix reserved for standalone action cards. */
export const BARCODE_ACTION_PREFIX = 'fa'

/*
 * Prefix used by the user login tokens issued in server/security/tokens.server.ts.
 * Not a barcode this module can resolve, but recognised so that scanning a login
 * token into an inventory set produces a pointed message instead of a blank
 * "not found" after a pointless database round trip.
 */
const TOKEN_PREFIX = 'ft'

/* Reverse lookup from prefix to entity kind. */
const PREFIX_TO_ENTITY_KIND: Record<string, BarcodeEntityKind> = Object.fromEntries(
  Object.entries(BARCODE_ENTITY_PREFIXES).map(([kind, prefix]) => [prefix, kind as BarcodeEntityKind])
) as Record<string, BarcodeEntityKind>

/* The CouchDB document type backing each barcode entity kind. */
export const BARCODE_KIND_DOC_TYPES: Record<BarcodeEntityKind, string> = {
  item: 'inventoryItem',
  container: 'container',
  equipment: 'storageEquipment'
}

/*
 * Actions that get their own printed card.
 *
 * `checkout` and `return` are deliberately absent: a bare scan of a set of
 * entities already toggles between them based on each entity's current status,
 * which is by far the most common operation and should need no extra card.
 *
 * `post_missing` is absent because an entity whose barcode was just scanned is by
 * definition not missing; `locate` is its meaningful counterpart. `note` is absent
 * because it carries no meaning without typed free text.
 */
export const BARCODE_ACTION_MNEMONICS: Partial<Record<InventoryActionType, string>> = {
  dispose: 'dispose',
  reserve: 'reserve',
  unreserve: 'unreserve',
  mark_expired: 'expired',
  locate: 'locate',
  move: 'move'
}

/* Numeric value of a base36 character, or -1 when out of alphabet. */
function charValue(char: string): number {
  return ALPHABET.indexOf(char)
}

/*
 * Compute the check character for a code body (prefix + payload, without the
 * check character itself). Returns null when the body contains a character
 * outside the base36 alphabet.
 */
export function computeCheckCharacter(body: string): string | null {
  let sum = 0
  for (let index = 0; index < body.length; index++) {
    const value = charValue(body[index]!)
    if (value < 0) return null
    sum += value * CHECK_WEIGHTS[index % CHECK_WEIGHTS.length]!
  }
  return ALPHABET[sum % BASE]!
}

/* Append the check character to a code body, yielding a complete barcode. */
export function withCheckCharacter(body: string): string {
  const check = computeCheckCharacter(body)
  if (check === null) {
    throw new Error(`Cannot build a barcode from "${body}": it contains characters outside the base36 alphabet.`)
  }
  return `${body}${check}`
}

/* Whether a complete code carries a valid check character. */
export function hasValidCheckCharacter(code: string): boolean {
  if (code.length < 2) return false
  const body = code.slice(0, -1)
  const check = code.slice(-1)
  return computeCheckCharacter(body) === check
}

/*
 * Build the barcode for an entity kind from an already-generated payload.
 *
 * Kept pure and payload-injected so it works identically on both sides: the
 * server supplies a cryptographically random payload, while the client can
 * reproduce and verify a code without needing a randomness source.
 */
export function buildEntityBarcode(kind: BarcodeEntityKind, payload: string): string {
  if (payload.length !== BARCODE_PAYLOAD_LENGTH) {
    throw new Error(`Barcode payload must be exactly ${BARCODE_PAYLOAD_LENGTH} characters, received ${payload.length}.`)
  }
  return withCheckCharacter(`${BARCODE_ENTITY_PREFIXES[kind]}${payload}`)
}

/* The printed code for an action card. Deterministic, so reprints stay identical. */
export function buildActionBarcode(action: InventoryActionType): string {
  const mnemonic = BARCODE_ACTION_MNEMONICS[action]
  if (!mnemonic) {
    throw new Error(`Action "${action}" has no barcode card. Supported actions: ${Object.keys(BARCODE_ACTION_MNEMONICS).join(', ')}.`)
  }
  return withCheckCharacter(`${BARCODE_ACTION_PREFIX}${mnemonic}`)
}

/*
 * Every action card, resolved once at module load. Action barcodes are static and
 * deterministic, so they need no CouchDB documents and can be printed once as a
 * reference sheet that stays valid indefinitely.
 */
export const ACTION_BARCODES: Record<string, InventoryActionType> = Object.fromEntries(
  Object.keys(BARCODE_ACTION_MNEMONICS).map((action) => {
    const typed = action as InventoryActionType
    return [buildActionBarcode(typed), typed]
  })
)

/*
 * The inverse of `ACTION_BARCODES`: action name to its barcode. Needed wherever a
 * barcode has to be produced for a known action rather than recognised from a scan
 * — printing the action reference sheet, for example.
 */
export const BARCODE_FOR_ACTION = Object.fromEntries(
  Object.keys(BARCODE_ACTION_MNEMONICS).map((action) => {
    const typed = action as InventoryActionType
    return [typed, buildActionBarcode(typed)]
  })
) as Record<InventoryActionType, string>

/* Normalise scanned input: trim surrounding whitespace and lowercase. */
export function normalizeBarcode(raw: string): string {
  return raw.trim().toLowerCase()
}

/*
 * The outcome of parsing a single scanned code.
 *
 * `foreign` is not an error. The `barcode` field accepts externally supplied codes
 * (a vendor's plate label, for example), so a code without a Firn prefix may still
 * identify an entity — it simply cannot be classified without a database lookup.
 */
export type ParsedBarcode
  = | { kind: 'entity', entityKind: BarcodeEntityKind, value: string }
    | { kind: 'action', action: InventoryActionType, value: string }
    | { kind: 'foreign', value: string }
    | { kind: 'invalid', value: string, reason: string }

/*
 * Classify a scanned code without touching the database.
 *
 * A Firn prefix with a failing check character is reported as invalid rather than
 * foreign: the prefix is strong evidence the code was meant to be a Firn barcode,
 * so treating it as an external label would mask a misread.
 */
export function parseBarcode(raw: string): ParsedBarcode {
  const value = normalizeBarcode(raw)

  if (!value) {
    return { kind: 'invalid', value, reason: 'Empty barcode.' }
  }

  const prefix = value.slice(0, 2)

  if (prefix === TOKEN_PREFIX) {
    return { kind: 'invalid', value, reason: 'This is a Firn login token, not an inventory barcode.' }
  }

  if (prefix === BARCODE_ACTION_PREFIX) {
    const action = ACTION_BARCODES[value]
    if (action) {
      return { kind: 'action', action, value }
    }
    return {
      kind: 'invalid',
      value,
      reason: hasValidCheckCharacter(value)
        ? 'Unknown action barcode.'
        : 'Action barcode failed its check character; it was probably misread.'
    }
  }

  const entityKind = PREFIX_TO_ENTITY_KIND[prefix]
  if (entityKind) {
    if (value.length !== prefix.length + BARCODE_PAYLOAD_LENGTH + 1) {
      return { kind: 'invalid', value, reason: 'Firn barcode has an unexpected length.' }
    }
    if (!hasValidCheckCharacter(value)) {
      return { kind: 'invalid', value, reason: 'Barcode failed its check character; it was probably misread.' }
    }
    return { kind: 'entity', entityKind, value }
  }

  return { kind: 'foreign', value }
}

/* Whether a code was issued by Firn (as opposed to an external label). */
export function isFirnBarcode(code: string): boolean {
  const parsed = parseBarcode(code)
  return parsed.kind === 'entity' || parsed.kind === 'action'
}

/* Upper bound on a single scanned set, guarding against a stuck scanner. */
export const MAX_SCAN_BATCH = 200

const scannedCodesSchema = z.array(z.string().min(1, { message: 'A scanned barcode cannot be empty' }))
  .min(1, { message: 'At least one barcode is required' })
  .max(MAX_SCAN_BATCH, { message: `At most ${MAX_SCAN_BATCH} barcodes can be processed at once` })

export const resolveBarcodesSchema = z.object({
  codes: scannedCodesSchema
})

export const applyBarcodeScanSchema = z.object({
  codes: scannedCodesSchema,
  logComment: z.string().nullish()
})

export const assignBarcodeSchema = z.object({
  entityKind: barcodeEntityKindSchema,
  slug: z.string().min(1, { message: 'Entity identifier is required' }),
  /*
   * Re-issuing invalidates the previously printed label, so the caller must opt in
   * explicitly rather than silently replacing a code that is already on a freezer.
   */
  replaceExisting: z.boolean().optional()
})

export type ResolveBarcodesInput = z.infer<typeof resolveBarcodesSchema>
export type ApplyBarcodeScanInput = z.infer<typeof applyBarcodeScanSchema>
export type AssignBarcodeInput = z.infer<typeof assignBarcodeSchema>
