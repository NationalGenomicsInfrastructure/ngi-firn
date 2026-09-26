import { couchDB } from '../../database/couchdb'
import { BarcodeService } from './barcodes.server'
import type { BarcodedDocument, BarcodeLookupHit } from './barcodes.server'
import { activeReservationOwnerId, reservationBlockedMessage } from './logging.server'
import { parseBarcode } from '~~/schemas/inventory/barcode'
import { allowedActionsForStatus } from '~~/schemas/inventory/metadata'
import type { InventoryActionType } from '~~/schemas/inventory/metadata'
import type {
  BarcodeScanPlan,
  BarcodeScanRejection,
  BarcodeScanResult,
  BarcodeScanTarget,
  BarcodeScanWarning,
  Container,
  InventoryItem,
  SerializedEntityRef,
  StorageEquipment
} from '../../../types/inventory'
import type { FirnUser } from '../../../types/auth'

/*
 * Barcode scan interpretation.
 * ****************************
 *
 * Turns a set of scanned codes into a reviewable plan. The guiding principle is
 * that ambiguity is surfaced rather than guessed: anything the resolver cannot
 * confidently interpret becomes a rejection, a warning, or a blocking error, never
 * a silently reinterpreted operation on someone's samples.
 *
 * The set is split into three roles:
 *
 *   - ACTION   a single "fa..." card naming the operation. Optional.
 *   - CONTEXT  where the operation happens. Always equipment; a container only
 *              when it is an ancestor of something else in the set.
 *   - TARGETS  the entities acted upon.
 *
 * With no action card, the default is the checkout/return toggle, resolved per
 * target from its current status. This is by far the most common lab operation,
 * so it must work from a bare scan with nothing extra to remember.
 */

/* Actions whose meaning is "put these entities somewhere", requiring a destination. */
const RELOCATING_ACTIONS: readonly InventoryActionType[] = ['move', 'locate']

/* Documents that can be acted upon. Equipment is context-only: it has no status. */
type ActionableDocument = Container | InventoryItem

function isActionable(doc: BarcodedDocument): doc is ActionableDocument {
  return doc.type === 'container' || doc.type === 'inventoryItem'
}

function toEntityRef(doc: BarcodedDocument): SerializedEntityRef {
  const kind = doc.type === 'inventoryItem'
    ? 'item'
    : doc.type === 'storageEquipment' ? 'equipment' : 'container'
  return { slug: doc.slug, name: doc.name, kind }
}

/*
 * Collect the document IDs of every ancestor of `doc`, walking parent references
 * upward.
 *
 * Ancestry is walked rather than read from a stored path: inventory documents hold
 * only a reference to their immediate parent, by deliberate design, so that moving
 * a container does not require cascading updates through its whole subtree.
 *
 * `cache` is shared across a whole scan so that sibling entities under the same
 * container do not each re-fetch the same chain. `seen` guards against a cyclic
 * parent chain, which the move validators prevent but which would otherwise hang
 * here if data were ever corrupted.
 */
async function collectAncestorIds(
  doc: BarcodedDocument,
  cache: Map<string, string | null>
): Promise<Set<string>> {
  const ancestors = new Set<string>()
  const seen = new Set<string>([doc._id])
  let currentParentId = doc.parent?.id ?? null

  while (currentParentId && !seen.has(currentParentId)) {
    ancestors.add(currentParentId)
    seen.add(currentParentId)

    if (!cache.has(currentParentId)) {
      const parentDoc = await couchDB.getDocument<StorageEquipment | Container>(currentParentId)
      cache.set(currentParentId, parentDoc?.parent?.id ?? null)
    }
    currentParentId = cache.get(currentParentId) ?? null
  }

  return ancestors
}

export const BarcodeScanService = {

  /*
   * Interpret a scanned set without writing anything.
   *
   * Safe to call repeatedly, which is what lets the UI re-resolve as codes are
   * added to the set and show the user what would happen before they commit.
   */
  async resolveScan(codes: string[], firnUser: FirnUser): Promise<BarcodeScanPlan> {
    const rejected: BarcodeScanRejection[] = []
    const warnings: BarcodeScanWarning[] = []

    // ---- Phase 1: parse locally, so misreads never reach the database ----
    const seenCodes = new Set<string>()
    const entityCodes: string[] = []
    const actions = new Set<InventoryActionType>()

    for (const raw of codes) {
      const parsed = parseBarcode(raw)

      if (parsed.kind === 'invalid') {
        rejected.push({ code: parsed.value, reason: 'invalid', message: parsed.reason })
        continue
      }

      if (seenCodes.has(parsed.value)) {
        // Scanning the same label twice is a slip, not an intent to act twice.
        warnings.push({
          kind: 'duplicate_scan',
          message: `Barcode "${parsed.value}" was scanned more than once; the duplicate was ignored.`,
          slug: null
        })
        continue
      }
      seenCodes.add(parsed.value)

      if (parsed.kind === 'action') {
        actions.add(parsed.action)
      }
      else {
        // Both Firn-issued and foreign codes are resolved by lookup; a foreign
        // vendor label is still a legitimate way to identify an entity.
        entityCodes.push(parsed.value)
      }
    }

    if (actions.size > 1) {
      return {
        action: null,
        explicitAction: false,
        context: null,
        targets: [],
        rejected,
        warnings,
        error: `The scanned set contains ${actions.size} different action cards (${[...actions].join(', ')}). Scan exactly one action card, or none to check items out and back in.`
      }
    }

    const action = [...actions][0] ?? null

    // ---- Phase 2: resolve every entity code in a single view query ----
    const { hits, missing, ambiguous } = await BarcodeService.lookupBarcodes(entityCodes)

    for (const code of missing) {
      rejected.push({
        code,
        reason: 'unknown',
        message: `Barcode "${code}" does not match any inventory entity.`
      })
    }
    for (const entry of ambiguous) {
      rejected.push({
        code: entry.code,
        reason: 'ambiguous',
        message: `Barcode "${entry.code}" is assigned to ${entry.documentIds.length} entities and cannot be resolved.`
      })
    }

    if (hits.length === 0) {
      return {
        action,
        explicitAction: action !== null,
        context: null,
        targets: [],
        rejected,
        warnings,
        error: 'No inventory entity could be resolved from the scanned barcodes.'
      }
    }

    // ---- Phase 3: split the set into context and targets ----
    const relocating = action !== null && RELOCATING_ACTIONS.includes(action)
    const { context, contextDoc, targetHits, roleWarnings } = await resolveRoles(hits, relocating)
    warnings.push(...roleWarnings)

    // ---- Phase 4: validate the action against the resolved roles ----
    if (relocating && !contextDoc) {
      return {
        action,
        explicitAction: true,
        context: null,
        targets: [],
        rejected,
        warnings,
        error: `A "${action}" scan needs a destination: scan the barcode of the container or equipment the entities should end up in, last.`
      }
    }

    // ---- Phase 5: derive the action for each target ----
    const parentRefs = await resolveTargetParentRefs(targetHits)

    // A reserved target can only be checked out by its reserver; resolve the holders'
    // names up front so a blocked target can name who to talk to, batched into one
    // fetch rather than one per reserved entity.
    const reserverNames = await resolveReserverNames(targetHits)

    const targets: BarcodeScanTarget[] = targetHits.map((hit) => {
      const doc = hit.doc as ActionableDocument
      const parentRef = doc.parent ? parentRefs.get(doc.parent.id) ?? null : null
      return buildTarget(hit, doc, action, contextDoc, parentRef, firnUser, reserverNames, warnings)
    })

    if (targets.length === 0) {
      return {
        action,
        explicitAction: action !== null,
        context,
        targets: [],
        rejected,
        warnings,
        error: contextDoc
          ? `Only the location "${contextDoc.name}" was scanned. Also scan the containers or items to act upon.`
          : 'No actionable container or item was resolved from the scanned barcodes.'
      }
    }

    return {
      action,
      explicitAction: action !== null,
      context,
      targets,
      rejected,
      warnings,
      error: null
    }
  },

  /*
   * Execute a scanned set.
   *
   * The codes are re-resolved here rather than accepting a plan from the client:
   * statuses may have changed between review and confirmation, and trusting a
   * submitted plan would let a forged one bypass the status/action state machine
   * entirely.
   *
   * Execution delegates to the existing batch services, so capacity bookkeeping,
   * grid placement, ordering and audit logging all stay in exactly one place.
   * Targets are grouped by action and entity kind so each service is called once
   * per group instead of once per entity.
   */
  async applyScan(codes: string[], firnUser: FirnUser, logComment?: string | null): Promise<BarcodeScanResult> {
    const plan = await BarcodeScanService.resolveScan(codes, firnUser)
    const applied: BarcodeScanResult['applied'] = []
    const failures: BarcodeScanResult['failures'] = []

    if (plan.error) {
      return { plan, applied, failures }
    }

    const executable = plan.targets.filter(target => target.executable && target.proposedAction)

    if (executable.length === 0) {
      return { plan, applied, failures }
    }

    const { ItemService } = await import('./items.server')
    const { ContainerService } = await import('./containers.server')

    // Group by action *and* kind: items and containers have separate services, and
    // the default toggle can yield checkout for one target and return for another.
    const groups = new Map<string, { action: InventoryActionType, kind: 'item' | 'container', targets: BarcodeScanTarget[] }>()
    for (const target of executable) {
      const action = target.proposedAction!
      const groupKey = `${action}:${target.kind}`
      const group = groups.get(groupKey) ?? { action, kind: target.kind, targets: [] }
      group.targets.push(target)
      groups.set(groupKey, group)
    }

    // A caller-supplied note is appended to each entity's action log; otherwise the
    // entry still records that the change came from a scan rather than the web UI.
    const entryComment = logComment?.trim()
      ? `Applied by barcode scan. ${logComment.trim()}`
      : 'Applied by barcode scan.'
    for (const group of groups.values()) {
      const slugs = group.targets.map(target => target.slug)

      try {
        if (group.action === 'move' || group.action === 'locate') {
          /*
           * Guarded by resolveScan, which refuses a relocating scan without a
           * destination; re-checked positively here both to narrow the ref's wider
           * `kind` union and so a future caller cannot skip that guarantee.
           */
          const destination = plan.context
          if (!destination || (destination.kind !== 'equipment' && destination.kind !== 'container')) {
            throw new Error('A destination container or equipment is required.')
          }
          const newParentSlug = destination.slug
          const newParentKind = destination.kind

          // `position` is deliberately omitted: a scan carries no placement, and the
          // services auto-place into the first free slot of a grid parent.
          if (group.kind === 'item') {
            const input = { itemSlug: slugs, newParentSlug, newParentKind, logComment: entryComment }
            if (group.action === 'move') await ItemService.moveItem(input, firnUser)
            else await ItemService.locateItem(input, firnUser)
          }
          else {
            const input = { containerSlug: slugs, newParentSlug, newParentKind, logComment: entryComment }
            if (group.action === 'move') await ContainerService.moveContainer(input, firnUser)
            else await ContainerService.locateContainer(input, firnUser)
          }
        }
        else if (group.kind === 'item') {
          await ItemService.alterItem(
            { itemSlug: slugs, performedAction: group.action, logComment: entryComment }, firnUser
          )
        }
        else {
          await ContainerService.alterContainer(
            { containerSlug: slugs, performedAction: group.action, logComment: entryComment }, firnUser
          )
        }

        applied.push({ action: group.action, slugs })
      }
      catch (error) {
        /*
         * The batch services validate every entity before writing any of them, so a
         * throw means the whole group was rejected. Attribute the failure to each
         * slug in the group rather than losing which entities did not change.
         */
        const message = error instanceof Error ? error.message : String(error)
        for (const slug of slugs) {
          failures.push({ slug, error: message })
        }
      }
    }

    return { plan, applied, failures }
  }
}

/*
 * Resolve the current parent of every target to a display reference, batched into
 * one fetch for the distinct parents rather than one per target — a scanned rack
 * of tubes shares a single parent.
 */
async function resolveTargetParentRefs(
  targetHits: BarcodeLookupHit[]
): Promise<Map<string, SerializedEntityRef>> {
  const parentIds = [...new Set(
    targetHits
      .map(hit => (hit.doc as ActionableDocument).parent?.id)
      .filter((id): id is string => Boolean(id))
  )]

  const refs = new Map<string, SerializedEntityRef>()
  if (parentIds.length === 0) return refs

  const parents = await couchDB.getDocumentsByIds<StorageEquipment | Container>(parentIds)
  for (const parent of parents) {
    if (parent && (parent.type === 'storageEquipment' || parent.type === 'container')) {
      refs.set(parent._id, toEntityRef(parent))
    }
  }
  return refs
}

/*
 * Resolve the display name of every distinct user who holds a reservation on one of
 * the targets, keyed by their stored user id. Only reserved targets contribute, and
 * the lookup is batched so a rack of reserved tubes costs a single fetch.
 */
async function resolveReserverNames(targetHits: BarcodeLookupHit[]): Promise<Map<string, string>> {
  const ownerIds = [...new Set(
    targetHits
      .filter(hit => isActionable(hit.doc))
      .map(hit => activeReservationOwnerId(hit.doc as ActionableDocument))
      .filter((id): id is string => Boolean(id))
  )]

  const names = new Map<string, string>()
  if (ownerIds.length === 0) return names

  const userDocs = await couchDB.getDocumentsByIds<FirnUser>(ownerIds)
  for (const doc of userDocs) {
    if (doc && doc.type === 'firnUser') {
      const name = doc.googleName?.trim()
        || [doc.googleGivenName, doc.googleFamilyName].filter(Boolean).join(' ').trim()
        || doc.githubName?.trim()
        || doc.firnId
      names.set(doc._id, name)
    }
  }
  return names
}

/*
 * Decide which resolved entities are the location context and which are targets.
 *
 * Equipment is always context, since it has no status or action log and therefore
 * cannot be acted upon at all. A container is genuinely ambiguous — "check out this
 * box" and "put these tubes back in this box" look identical on the scanner — so
 * the two cases are distinguished differently depending on the operation:
 *
 *   - For lifecycle actions (the checkout/return toggle, dispose, reserve, ...) the
 *     context is where the entities already are, so a scanned container is the
 *     location exactly when it encloses something else in the set.
 *
 *   - For move and locate the destination is by definition NOT the current parent,
 *     so the enclosure test cannot identify it. The destination is instead the last
 *     location scanned, matching the physical workflow of gathering the entities
 *     first and scanning the shelf they are going onto last.
 */
async function resolveRoles(hits: BarcodeLookupHit[], relocating: boolean): Promise<{
  context: SerializedEntityRef | null
  contextDoc: BarcodedDocument | null
  targetHits: BarcodeLookupHit[]
  roleWarnings: BarcodeScanWarning[]
}> {
  const roleWarnings: BarcodeScanWarning[] = []

  if (relocating) {
    // `hits` preserves scan order, so the last location-capable code is the one the
    // user scanned last and therefore the intended destination.
    const locationHits = hits.filter(
      hit => hit.doc.type === 'storageEquipment' || hit.doc.type === 'container'
    )
    const destination = locationHits[locationHits.length - 1] ?? null

    if (!destination) {
      return { context: null, contextDoc: null, targetHits: [], roleWarnings }
    }

    return {
      context: toEntityRef(destination.doc),
      contextDoc: destination.doc,
      targetHits: hits.filter(hit => isActionable(hit.doc) && hit.doc._id !== destination.doc._id),
      roleWarnings
    }
  }

  const parentCache = new Map<string, string | null>()

  // Union of every scanned entity's ancestors; a scanned container appearing here
  // encloses something else that was scanned.
  const ancestorIds = new Set<string>()
  for (const hit of hits) {
    for (const id of await collectAncestorIds(hit.doc, parentCache)) {
      ancestorIds.add(id)
    }
  }

  const equipmentHits = hits.filter(hit => hit.doc.type === 'storageEquipment')
  const containerContextHits = hits.filter(
    hit => hit.doc.type === 'container' && ancestorIds.has(hit.doc._id)
  )

  /*
   * Prefer the most specific location. Scanning a box, the rack it sits in and a
   * vial inside the box makes both containers ancestors, but only the box names
   * where the vial actually is — reporting the rack would produce a misleading
   * parent mismatch. Depth is measured by ancestor-chain length, so the deepest
   * enclosing container wins regardless of the order the labels were scanned in,
   * and any enclosing container beats the equipment it sits in.
   */
  const containerDepths = new Map<string, number>()
  for (const hit of containerContextHits) {
    containerDepths.set(hit.doc._id, (await collectAncestorIds(hit.doc, parentCache)).size)
  }
  const orderedContainers = [...containerContextHits].sort(
    (a, b) => (containerDepths.get(b.doc._id) ?? 0) - (containerDepths.get(a.doc._id) ?? 0)
  )

  const contextCandidates = [...orderedContainers, ...equipmentHits]
  const contextHit = contextCandidates[0] ?? null

  if (contextCandidates.length > 1) {
    roleWarnings.push({
      kind: 'context_ignored',
      message: `Several locations were scanned; "${contextHit!.doc.name}" was used and the rest ignored.`,
      slug: null
    })
  }

  const contextIds = new Set(contextCandidates.map(hit => hit.doc._id))
  const targetHits = hits.filter(hit => isActionable(hit.doc) && !contextIds.has(hit.doc._id))

  return {
    context: contextHit ? toEntityRef(contextHit.doc) : null,
    contextDoc: contextHit?.doc ?? null,
    targetHits,
    roleWarnings
  }
}

/*
 * Determine the action for a single target and whether it can actually be applied.
 *
 * With no action card the operation is the checkout/return toggle, decided from the
 * entity's own status so that a mixed set (some out, some shelved) does the right
 * thing for each entity rather than forcing one operation onto all of them.
 *
 * The status/action state machine is consulted rather than restated, so the rules
 * cannot drift from the ones the write services enforce.
 */
function buildTarget(
  hit: BarcodeLookupHit,
  doc: Container | InventoryItem,
  action: InventoryActionType | null,
  contextDoc: BarcodedDocument | null,
  parentRef: SerializedEntityRef | null,
  firnUser: FirnUser,
  reserverNames: Map<string, string>,
  warnings: BarcodeScanWarning[]
): BarcodeScanTarget {
  const kind = doc.type === 'inventoryItem' ? 'item' : 'container'

  const base = {
    code: hit.code,
    slug: doc.slug,
    name: doc.name,
    kind: kind as 'container' | 'item',
    status: doc.status,
    parentRef
  }

  const proposed = action ?? defaultToggleAction(doc.status)

  if (!proposed) {
    return {
      ...base,
      proposedAction: null,
      executable: false,
      reason: `"${doc.name}" is ${doc.status}, which is neither available to check out nor checked out to return. Scan an action card to say what should happen.`
    }
  }

  /*
   * Relocating actions are dedicated workflows, not lifecycle transitions, so the
   * status/action matrix does not describe them: `move` appears in no status row at
   * all, and gating it on the matrix would reject every move. Their real
   * preconditions come from the move/locate services instead.
   */
  if (proposed === 'move') {
    if (doc.status === 'lost' || doc.status === 'disposed') {
      return {
        ...base,
        proposedAction: proposed,
        executable: false,
        reason: doc.status === 'lost'
          ? `"${doc.name}" is marked lost and is not stored anywhere, so it cannot be moved. Scan a locate card to put it back.`
          : `"${doc.name}" has been disposed of and cannot be moved.`
      }
    }
  }
  else if (proposed === 'locate') {
    if (doc.status !== 'lost') {
      return {
        ...base,
        proposedAction: proposed,
        executable: false,
        reason: `"${doc.name}" is ${doc.status}, not lost, so there is nothing to locate. Scan a move card to relocate it instead.`
      }
    }
  }
  else if (!allowedActionsForStatus(doc.status).includes(proposed)) {
    return {
      ...base,
      proposedAction: proposed,
      executable: false,
      reason: `"${proposed}" is not allowed on "${doc.name}" while it is ${doc.status}.`
    }
  }

  // A reserved entity may only be checked out by whoever reserved it. Everyone else is
  // blocked and told who to talk to, so a forgotten or contested reservation surfaces
  // as a conversation rather than a silent takeover.
  if (proposed === 'checkout' && doc.status === 'reserved') {
    const ownerId = activeReservationOwnerId(doc)
    if (ownerId && ownerId !== firnUser._id) {
      return {
        ...base,
        proposedAction: proposed,
        executable: false,
        reason: reservationBlockedMessage(
          doc.type === 'inventoryItem' ? 'inventory_item' : 'container',
          doc.name,
          reserverNames.get(ownerId) ?? 'another user'
        )
      }
    }
  }

  // A mismatch is reported but not corrected: silently relocating on a plain scan
  // would make it far too easy to move samples by forgetting to clear the set
  // between two unrelated operations. Relocation requires an explicit action card.
  if (contextDoc && !RELOCATING_ACTIONS.includes(proposed)) {
    const parentId = doc.parent?.id ?? null
    if (parentId && parentId !== contextDoc._id) {
      warnings.push({
        kind: 'parent_mismatch',
        message: `"${doc.name}" is not currently stored in "${contextDoc.name}". It was ${proposed === 'return' ? 'returned' : 'updated'} where it is; scan a move card to relocate it.`,
        slug: doc.slug
      })
    }
  }

  return {
    ...base,
    proposedAction: proposed,
    executable: true,
    reason: null
  }
}

/*
 * The default operation for a bare scan: check out what is shelved, return what is
 * out. A reserved entity also checks out — its reserver walking up to use it is the
 * whole point of reserving — but the ownership guard in buildTarget blocks anyone
 * else. Any other status has no obvious counterpart and needs an explicit card.
 */
function defaultToggleAction(status: Container['status']): InventoryActionType | null {
  if (status === 'available') return 'checkout'
  if (status === 'reserved') return 'checkout'
  if (status === 'in_use') return 'return'
  return null
}
