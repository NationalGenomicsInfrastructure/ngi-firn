import { randomBytes } from 'crypto'
import { couchDB } from '../../database/couchdb'
import {
  BARCODE_KIND_DOC_TYPES,
  BARCODE_PAYLOAD_LENGTH,
  buildEntityBarcode,
  normalizeBarcode,
  parseBarcode
} from '~~/schemas/inventory/barcode'
import type { BarcodeEntityKind } from '~~/schemas/inventory/barcode'
import type { Container, InventoryItem, StorageEquipment } from '../../../types/inventory'
import type { FirnUser } from '../../../types/auth'

/*
 * Barcode generation and lookup.
 * ******************************
 *
 * Issues unique inventory barcodes and resolves scanned codes back to documents.
 * Everything here is deliberately kind-agnostic: the three entity services call in
 * rather than each growing their own copy of the uniqueness loop.
 *
 * Lookups go through the pre-existing `by_barcode` view, whose key is the bare
 * barcode with no document type. That shape is what makes a single global
 * uniqueness check possible: a code must identify exactly one physical object, and
 * a container reusing an item's code would make any scan ambiguous. The absent type
 * in the key does mean a resolved document must always be type-checked afterwards.
 *
 * GENERATION:
 * generateUniqueBarcode(kind) - Issue a fresh, collision-checked barcode
 *
 * LOOKUP:
 * lookupBarcodes(codes) - Resolve many codes in one view query
 * findDocumentByBarcode(code) - Resolve a single code
 * isBarcodeTaken(code, ignoreDocumentId?) - Uniqueness probe
 * assertBarcodeAvailable(code, ignoreDocumentId?) - Throwing uniqueness guard
 *
 * ASSIGNMENT:
 * resolveBarcodeForCreate(kind, supplied?) - Barcode to store on a new document
 * resolveBarcodeForUpdate(supplied, existing, id) - Barcode to store on an edit
 * assignBarcode(input, firnUser) - Issue and persist a fresh barcode for an entity
 */

/* Any document type that can carry a barcode. Rooms are excluded by design. */
export type BarcodedDocument = StorageEquipment | Container | InventoryItem

/* A scanned code successfully resolved to exactly one document. */
export type BarcodeLookupHit = {
  code: string
  entityKind: BarcodeEntityKind
  doc: BarcodedDocument
}

/* Reverse of BARCODE_KIND_DOC_TYPES: CouchDB document type to barcode entity kind. */
const DOC_TYPE_TO_KIND: Record<string, BarcodeEntityKind> = Object.fromEntries(
  Object.entries(BARCODE_KIND_DOC_TYPES).map(([kind, docType]) => [docType, kind as BarcodeEntityKind])
) as Record<string, BarcodeEntityKind>

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/*
 * Largest multiple of 36 that fits in a byte. Bytes at or above this are redrawn
 * rather than folded with a plain modulo, which would make the first four
 * characters of the alphabet measurably more likely than the rest. The payload is
 * the only thing standing between two labels colliding, so it is worth keeping
 * uniformly distributed.
 */
const REJECTION_THRESHOLD = 252

/* A uniformly random base36 string of the given length. */
function randomPayload(length: number): string {
  let payload = ''
  while (payload.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= REJECTION_THRESHOLD) continue
      payload += ALPHABET[byte % ALPHABET.length]!
      if (payload.length === length) break
    }
  }
  return payload
}

/*
 * How many times to retry on collision before giving up.
 *
 * With 36^8 (~2.8 x 10^12) possible payloads, a collision is already vanishingly
 * unlikely; several in a row means something is wrong (a broken randomness source,
 * or the view returning stale data) and should surface as an error rather than
 * spin indefinitely.
 */
const MAX_GENERATION_ATTEMPTS = 8

export const BarcodeService = {

  /*
   * Resolve a batch of scanned codes in a single view query.
   *
   * One round trip for the whole scanned set rather than one per code, which
   * matters when a user scans a full rack. Codes that resolve to nothing, to a
   * room, or to more than one document are reported separately instead of being
   * silently dropped, so the caller can explain precisely what went wrong.
   */
  async lookupBarcodes(codes: string[]): Promise<{
    hits: BarcodeLookupHit[]
    missing: string[]
    ambiguous: { code: string, documentIds: string[] }[]
  }> {
    const normalized = [...new Set(codes.map(normalizeBarcode).filter(Boolean))]
    if (normalized.length === 0) {
      return { hits: [], missing: [], ambiguous: [] }
    }

    const result = await couchDB.queryView<string, null, BarcodedDocument>(
      'firn-inventory',
      'by_barcode',
      {
        keys: normalized,
        include_docs: true,
        reduce: false
      }
    )

    // Group by the emitted key rather than by document, so a code indexed against
    // two documents is detectable instead of resolving to whichever came first.
    const byCode = new Map<string, BarcodedDocument[]>()
    for (const row of result.rows) {
      if (!row.doc) continue
      const entityKind = DOC_TYPE_TO_KIND[row.doc.type]
      // Rooms are indexed by the shared view but have no barcode workflow.
      if (!entityKind) continue
      const bucket = byCode.get(row.key) ?? []
      bucket.push(row.doc)
      byCode.set(row.key, bucket)
    }

    const hits: BarcodeLookupHit[] = []
    const missing: string[] = []
    const ambiguous: { code: string, documentIds: string[] }[] = []

    for (const code of normalized) {
      const docs = byCode.get(code) ?? []
      const first = docs[0]
      if (!first) {
        missing.push(code)
      }
      else if (docs.length > 1) {
        ambiguous.push({ code, documentIds: docs.map(doc => doc._id) })
      }
      else {
        hits.push({ code, entityKind: DOC_TYPE_TO_KIND[first.type]!, doc: first })
      }
    }

    return { hits, missing, ambiguous }
  },

  /* Resolve a single code. Returns null when nothing or more than one thing matches. */
  async findDocumentByBarcode(code: string): Promise<BarcodeLookupHit | null> {
    const { hits } = await BarcodeService.lookupBarcodes([code])
    return hits[0] ?? null
  },

  /*
   * Whether a code already identifies a document.
   *
   * `ignoreDocumentId` excludes the entity being edited, so re-submitting an
   * unchanged form does not report the entity as colliding with itself.
   */
  async isBarcodeTaken(code: string, ignoreDocumentId?: string): Promise<boolean> {
    const normalized = normalizeBarcode(code)
    if (!normalized) return false

    const result = await couchDB.queryView<string, null, BarcodedDocument>(
      'firn-inventory',
      'by_barcode',
      {
        key: normalized,
        include_docs: true,
        reduce: false
      }
    )

    return result.rows.some(row => row.doc && row.doc._id !== ignoreDocumentId)
  },

  /*
   * Validate a manually supplied barcode, throwing when it cannot be accepted.
   *
   * The edit forms let users type a barcode directly (to record an external vendor
   * label, for example). Without this guard two entities could end up sharing a
   * code and every scan of it would be ambiguous. A Firn-prefixed code that fails
   * its check character is also rejected here, since accepting a mistyped one would
   * mint a code that no printed label can ever match.
   *
   * `expectedKind` guards the self-describing property of the format: a valid `fi…`
   * item code typed onto a container would otherwise be stored happily, leaving a
   * label that announces the wrong entity kind to anything reading the code before
   * it resolves the document.
   */
  async assertBarcodeAvailable(
    code: string,
    ignoreDocumentId?: string,
    expectedKind?: BarcodeEntityKind
  ): Promise<string> {
    const normalized = normalizeBarcode(code)

    const parsed = parseBarcode(normalized)
    if (parsed.kind === 'invalid') {
      throw new Error(`Barcode "${normalized}" cannot be used: ${parsed.reason}`)
    }
    if (parsed.kind === 'action') {
      throw new Error(`Barcode "${normalized}" is a reserved action card and cannot be assigned to an entity.`)
    }
    if (parsed.kind === 'entity' && expectedKind && parsed.entityKind !== expectedKind) {
      throw new Error(
        `Barcode "${normalized}" is a Firn ${parsed.entityKind} code and cannot be assigned to a ${expectedKind}. Leave the field empty to have Firn issue a ${expectedKind} barcode.`
      )
    }

    if (await BarcodeService.isBarcodeTaken(normalized, ignoreDocumentId)) {
      throw new Error(`Barcode "${normalized}" is already assigned to another inventory entity.`)
    }

    return normalized
  },

  /*
   * Issue a fresh barcode for an entity kind, verified unique against the database.
   *
   * Generation is separated from persistence so a caller can obtain a code before
   * the document exists, which is what lets createItem/createContainer/createEquipment
   * write the barcode in the same document as everything else rather than creating
   * first and patching afterwards.
   */
  async generateUniqueBarcode(kind: BarcodeEntityKind): Promise<string> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const candidate = buildEntityBarcode(kind, randomPayload(BARCODE_PAYLOAD_LENGTH))
      if (!(await BarcodeService.isBarcodeTaken(candidate))) {
        return candidate
      }
    }
    throw new Error(
      `Could not generate a unique ${kind} barcode after ${MAX_GENERATION_ATTEMPTS} attempts. This suggests a failing randomness source rather than genuine exhaustion of the code space.`
    )
  },

  /*
   * Resolve the barcode to store for a new entity: an explicitly supplied external
   * label if given (validated for uniqueness), otherwise a freshly issued Firn code.
   */
  async resolveBarcodeForCreate(kind: BarcodeEntityKind, supplied?: string | null): Promise<string> {
    const trimmed = supplied?.trim()
    if (trimmed) {
      return await BarcodeService.assertBarcodeAvailable(trimmed, undefined, kind)
    }
    return await BarcodeService.generateUniqueBarcode(kind)
  },

  /*
   * Resolve the barcode to store when updating an entity, following the tri-state
   * convention used throughout the update services: `undefined` leaves the value
   * untouched, `null` or an empty string clears it, and a string sets it.
   *
   * Re-submitting the unchanged value is a no-op rather than a self-collision,
   * since the edit forms post every field back regardless of what was touched.
   */
  async resolveBarcodeForUpdate(
    supplied: string | null | undefined,
    existingBarcode: string | null,
    documentId: string,
    expectedKind?: BarcodeEntityKind
  ): Promise<string | null> {
    if (supplied === undefined) return existingBarcode

    const trimmed = supplied?.trim()
    if (!trimmed) return null

    const normalized = normalizeBarcode(trimmed)
    if (normalized === existingBarcode) return existingBarcode

    return await BarcodeService.assertBarcodeAvailable(normalized, documentId, expectedKind)
  },

  /*
   * Issue a fresh barcode for an existing entity and persist it.
   *
   * Re-issuing orphans whatever label is already stuck on the physical object: the
   * printed code stops resolving. That is why replacing an existing barcode requires
   * an explicit opt-in rather than happening silently.
   *
   * The write is delegated to the entity's own update service so that validation and
   * the `modify` action-log entry are produced exactly as they are for a manual edit,
   * instead of this module writing documents behind the services' backs.
   */
  async assignBarcode(
    input: { entityKind: BarcodeEntityKind, slug: string, replaceExisting?: boolean },
    firnUser: FirnUser
  ): Promise<{ slug: string, barcode: string, previousBarcode: string | null }> {
    const { entityKind, slug, replaceExisting } = input

    const existing = await loadBarcodedEntity(entityKind, slug)
    if (!existing) {
      throw new Error(`No ${entityKind} found with identifier "${slug}".`)
    }

    if (existing.barcode && !replaceExisting) {
      throw new Error(
        `"${existing.name}" already has the barcode "${existing.barcode}". Re-issuing will stop the printed label from working, so it has to be confirmed explicitly.`
      )
    }

    const barcode = await BarcodeService.generateUniqueBarcode(entityKind)
    const previousBarcode = existing.barcode ?? null

    const logComment = previousBarcode
      ? `Barcode re-issued as "${barcode}"; the previously printed label "${previousBarcode}" no longer resolves.`
      : `Barcode "${barcode}" assigned.`

    if (entityKind === 'item') {
      const { ItemService } = await import('./items.server')
      await ItemService.updateItem({ itemSlug: slug, barcode, logComment }, firnUser)
    }
    else if (entityKind === 'container') {
      const { ContainerService } = await import('./containers.server')
      await ContainerService.updateContainer({ containerSlug: slug, barcode, logComment }, firnUser)
    }
    else {
      // Equipment has no action log, so there is no comment to record.
      const { EquipmentService } = await import('./equipment.server')
      await EquipmentService.updateEquipment({ equipmentSlug: slug, barcode })
    }

    return { slug, barcode, previousBarcode }
  }
}

/* Fetch an entity of the given kind by slug, without caring which service owns it. */
async function loadBarcodedEntity(
  kind: BarcodeEntityKind,
  slug: string
): Promise<BarcodedDocument | null> {
  if (kind === 'item') {
    const { ItemService } = await import('./items.server')
    return await ItemService.getItemBySlug(slug)
  }
  if (kind === 'container') {
    const { ContainerService } = await import('./containers.server')
    return await ContainerService.getContainerBySlug(slug)
  }
  const { EquipmentService } = await import('./equipment.server')
  return await EquipmentService.getEquipmentBySlug(slug)
}
