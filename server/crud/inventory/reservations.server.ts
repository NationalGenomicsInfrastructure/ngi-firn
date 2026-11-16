/*
 * Reservation (physical-hold) service
 * ***********************************
 *
 * Acquire, consume and release the server-owned task holds modelled in reservationState.ts. A hold
 * marks an inventory object (or a parent's cell/capacity) as spoken-for by planned task work so that
 * ordinary lab activity does not clash with a pre-planned move, and so a planned destination stays
 * reserved until the step is confirmed or skipped.
 *
 * Concurrency posture: NGI Firn has a small user base that rarely touches overlapping inventory, so
 * this module deliberately keeps it simple — ordinary read-modify-write on the authoritative resource
 * document, backed by the grid_occupancy view for physical placement. `_rev` still guards each write
 * (a stale write is retried a couple of times), but there is no elaborate multi-document arbitration
 * or stale-worker fencing: for this workload a view-backed last-writer-wins is sufficient.
 *
 * Holds never change an object's status, placement or physical `stored` counter; acquiring a hold
 * only edits the reservation ledger. Consume marks a claim fulfilled (still live, so it keeps
 * protecting until release); release drops it.
 */

import { couchDB, isCouchConflict } from '~~/server/database/couchdb'
import type { ContainerCapacityEntry } from '~~/schemas/inventory/container'
import type { FirnUser } from '../../../types/auth'
import type { TypedDocumentReference } from '../../../types/references'
import type {
  Container,
  GridPosition,
  StorageEquipment
} from '../../../types/inventory'
import {
  type ClaimOwner,
  compactReservations,
  heldCapacityCount,
  heldGridCellCount,
  type HoldableResource,
  isGridCellHeld,
  isLiveState,
  liveCapacityClaims,
  liveGridCellClaims,
  liveTargetHold,
  normalizeReservations
} from './reservationState'
import { deriveGridLabel, isSlotOccupied, isWithinGrid } from './grid.server'

/* A few retries absorb the rare concurrent edit; beyond that a 409 surfaces to the caller. */
const MAX_CAS_ATTEMPTS = 3

/* A generic, task-data-free conflict surfaced to ordinary writers that touch held inventory. */
export class ReservationConflictError extends Error {
  readonly code = 'reservation_conflict'
  constructor(message = 'This inventory object is reserved by planned task work and cannot be changed directly.') {
    super(message)
    this.name = 'ReservationConflictError'
  }
}

/* Thrown when a hold operation targets a resource document that no longer exists. */
export class ReservationResourceMissingError extends Error {
  readonly code = 'reservation_resource_missing'
  constructor(resourceId: string) {
    super(`Reservation resource "${resourceId}" could not be found.`)
    this.name = 'ReservationResourceMissingError'
  }
}

/* Context shared by every claim: which activation/step/operation acts, and its handover generation. */
export interface HoldClaimContext {
  activationId: string
  stepId: string
  /* Advances on handover so earlier exports become invalid; recorded, not used for fencing. */
  generation: number
  /* The operation that last transitioned the claim; binds idempotent consume/release. */
  operationId: string | null
}

/* Target-hold context additionally records the sole executor allowed to act on the held object. */
export interface TargetHoldContext extends HoldClaimContext {
  executor: TypedDocumentReference<FirnUser>
}

type ApplyResult<T> = { doc: T, changed: boolean }

/*
 * Read the holdable resource, apply a pure transform and write it back under its `_rev`, retrying a
 * couple of times on a 409 with a fresh read. `apply` may run more than once, so it must be a pure
 * function of the document it receives; it throws to abort, or returns `changed: false` for an
 * idempotent no-op that skips the write.
 */
async function mutateHoldable<T extends HoldableResource>(
  resourceId: string,
  apply: (doc: T) => ApplyResult<T>
): Promise<T> {
  let lastConflict: unknown = null
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const doc = await couchDB.getDocument<T>(resourceId)
    if (!doc) {
      throw new ReservationResourceMissingError(resourceId)
    }
    const { doc: next, changed } = apply(doc)
    if (!changed) {
      return doc
    }
    try {
      const result = await couchDB.updateDocument(next._id, next, next._rev as string)
      next._rev = result.rev
      return next
    }
    catch (error) {
      if (isCouchConflict(error)) {
        lastConflict = error
        continue
      }
      throw error
    }
  }
  throw lastConflict ?? new ReservationConflictError('Could not acquire a stable revision to record the reservation.')
}

function samePosition(a: GridPosition, b: { row: number, column: number, level?: number }): boolean {
  return a.row === b.row && a.column === b.column && (a.level ?? 1) === (b.level ?? 1)
}

// ---------------------------------------------------------------------------------------------
// Target holds (object-level lock on an item or container)
// ---------------------------------------------------------------------------------------------

/*
 * Acquire the object-level target hold on an item/container for one step. One activation holds an
 * object once for all of its steps: a second step of the same activation joins the existing hold
 * (so "checkout X" and "return X" can be activated together), while a hold owned by a different
 * activation is refused. Idempotent per step. The generation is recorded (advances on handover, which
 * also re-stamps the executor) but is not used to fence writers.
 */
export async function acquireTargetHold(resourceId: string, ctx: TargetHoldContext): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const existing = state.targetHold && isLiveState(state.targetHold.state) ? state.targetHold : null
    if (existing && existing.activationId !== ctx.activationId) {
      throw new ReservationConflictError()
    }
    const joined = existing?.stepIds ?? []
    if (existing && joined.includes(ctx.stepId) && existing.generation === ctx.generation && existing.state === 'held') {
      return { doc, changed: false }
    }
    state.targetHold = {
      activationId: ctx.activationId,
      stepIds: joined.includes(ctx.stepId) ? joined : [...joined, ctx.stepId],
      executor: ctx.executor,
      generation: ctx.generation,
      state: 'held',
      operationId: ctx.operationId
    }
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

/*
 * Mark the target hold consumed for a step (its physical change committed). Still live until
 * released. Idempotent; a step that no longer shares the hold is a no-op.
 */
export async function consumeTargetHold(resourceId: string, ctx: HoldClaimContext): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const hold = state.targetHold
    if (!hold || !isLiveState(hold.state)) {
      return { doc, changed: false }
    }
    if (hold.activationId !== ctx.activationId) {
      throw new ReservationConflictError()
    }
    if (!hold.stepIds.includes(ctx.stepId)) {
      return { doc, changed: false }
    }
    if (hold.state === 'consumed' && hold.operationId === ctx.operationId) {
      return { doc, changed: false }
    }
    hold.state = 'consumed'
    hold.operationId = ctx.operationId
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

/*
 * Release one step's share of the target hold. The hold itself is dropped only when the last step
 * sharing it is released; until then it returns to `held` for the remaining steps. Idempotent; only
 * the owning activation may release.
 */
export async function releaseTargetHold(resourceId: string, ctx: HoldClaimContext): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const hold = state.targetHold
    if (!hold || !isLiveState(hold.state)) {
      return { doc, changed: false }
    }
    if (hold.activationId !== ctx.activationId) {
      throw new ReservationConflictError()
    }
    if (!hold.stepIds.includes(ctx.stepId)) {
      return { doc, changed: false }
    }
    hold.stepIds = hold.stepIds.filter(stepId => stepId !== ctx.stepId)
    hold.state = hold.stepIds.length === 0 ? 'released' : 'held'
    hold.operationId = ctx.operationId
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

// ---------------------------------------------------------------------------------------------
// Grid-cell claims (parent-side exact-cell allocation)
// ---------------------------------------------------------------------------------------------

/*
 * Claim one exact grid cell on a parent grid container so a pre-planned placement's destination stays
 * reserved. Idempotent for the same activation/step and cell; a step holds at most one cell on a
 * parent, so re-claiming a different cell replaces the prior one. The cell must exist in the parent's
 * grid, be physically free, and not be held by any other step (of this or another activation), so a
 * reservation that could never be honoured is refused at activation rather than at confirmation.
 */
export async function acquireGridCellClaim(
  parentId: string,
  position: GridPosition,
  ctx: HoldClaimContext
): Promise<HoldableResource> {
  // Physical occupancy comes from the grid_occupancy view, so it is checked before the CAS write.
  const occupied = await isSlotOccupied(parentId, position)
  return mutateHoldable(parentId, (doc) => {
    const grid = doc.type === 'container' ? doc.capacity?.find(entry => entry.layout === 'grid') : undefined
    if (!grid || grid.layout !== 'grid') {
      throw new ReservationConflictError('The destination has no grid in which a cell could be reserved.')
    }
    if (!isWithinGrid(position, { rows: grid.rows, columns: grid.columns, levels: grid.levels ?? 1 })) {
      throw new ReservationConflictError('The destination cell lies outside the grid of its container.')
    }
    const state = normalizeReservations(doc.reservations)
    const existingForStep = state.gridCells.find(
      claim => claim.activationId === ctx.activationId && claim.stepId === ctx.stepId && isLiveState(claim.state)
    )
    if (existingForStep && samePosition(existingForStep.position, position)) {
      return { doc, changed: false }
    }
    if (occupied) {
      throw new ReservationConflictError('The destination cell is already occupied.')
    }
    if (isGridCellHeld(doc, position, ctx)) {
      throw new ReservationConflictError('The destination cell is already reserved by planned task work.')
    }
    state.gridCells = state.gridCells.filter(
      claim => !(claim.activationId === ctx.activationId && claim.stepId === ctx.stepId && isLiveState(claim.state))
    )
    state.gridCells.push({
      activationId: ctx.activationId,
      stepId: ctx.stepId,
      position,
      generation: ctx.generation,
      state: 'held',
      operationId: ctx.operationId
    })
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

// ---------------------------------------------------------------------------------------------
// Capacity claims (parent-side count/category allocation)
// ---------------------------------------------------------------------------------------------

/* Which side of the hierarchy a child sits on; selects the right capacity array on a parent. */
export type CapacityChildKind = 'container' | 'item'

/* The physical capacity/stored counters for one count-layout category on a parent, or null. */
export function readCountCapacity(
  parent: Container | StorageEquipment,
  category: string,
  childKind: CapacityChildKind
): { capacity: number, stored: number } | null {
  if (parent.type === 'storageEquipment') {
    if (childKind === 'container') {
      const entry = parent.capacity?.find(capacityEntry => capacityEntry.type === category)
      return entry ? { capacity: entry.capacity, stored: entry.stored } : null
    }
    const entry = parent.itemCapacity?.find(capacityEntry => capacityEntry.category === category)
    return entry ? { capacity: entry.capacity, stored: entry.stored } : null
  }
  const entry = parent.capacity?.find(
    (capacityEntry): capacityEntry is Extract<ContainerCapacityEntry, { layout: 'count' }> =>
      capacityEntry.layout === 'count' && capacityEntry.type === category
  )
  return entry ? { capacity: entry.capacity, stored: entry.stored } : null
}

/*
 * Claim `count` units of a count-layout category on a parent. Validates that physical occupancy plus
 * independently held capacity leaves room, so a pre-planned placement keeps a slot free. Idempotent
 * for the same activation/step.
 */
export async function acquireCapacityClaim(
  parentId: string,
  category: string,
  childKind: CapacityChildKind,
  count: number,
  ctx: HoldClaimContext
): Promise<HoldableResource> {
  return mutateHoldable(parentId, (doc) => {
    if (doc.type === 'inventoryItem') {
      throw new ReservationConflictError('An inventory item cannot hold capacity claims.')
    }
    const state = normalizeReservations(doc.reservations)
    const existingForStep = state.capacityClaims.find(
      claim => claim.activationId === ctx.activationId && claim.stepId === ctx.stepId && isLiveState(claim.state)
    )
    if (existingForStep && existingForStep.category === category && existingForStep.count === count) {
      return { doc, changed: false }
    }
    const limits = readCountCapacity(doc, category, childKind)
    if (limits) {
      const otherHeld = heldCapacityCount(doc, category, ctx)
      if (limits.stored + otherHeld + count > limits.capacity) {
        throw new ReservationConflictError('Not enough free capacity to reserve for planned task work.')
      }
    }
    state.capacityClaims = state.capacityClaims.filter(
      claim => !(claim.activationId === ctx.activationId && claim.stepId === ctx.stepId && isLiveState(claim.state))
    )
    state.capacityClaims.push({
      activationId: ctx.activationId,
      stepId: ctx.stepId,
      category,
      count,
      generation: ctx.generation,
      state: 'held',
      operationId: ctx.operationId
    })
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

// ---------------------------------------------------------------------------------------------
// Generic claim release (grid cell / capacity, by activation + step)
// ---------------------------------------------------------------------------------------------

/*
 * Release every live parent-side claim (grid cell, capacity) recorded for one
 * activation + step on a resource. Idempotent and safe to retry.
 */
export async function releaseParentClaimsForStep(
  resourceId: string,
  ctx: Pick<HoldClaimContext, 'activationId' | 'stepId'>
): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const owns = (claim: { activationId: string, stepId: string }): boolean =>
      claim.activationId === ctx.activationId && claim.stepId === ctx.stepId
    const before = state.gridCells.length + state.capacityClaims.length
    state.gridCells = state.gridCells.filter(claim => !(owns(claim) && isLiveState(claim.state)))
    state.capacityClaims = state.capacityClaims.filter(claim => !(owns(claim) && isLiveState(claim.state)))
    const after = state.gridCells.length + state.capacityClaims.length
    if (before === after) {
      return { doc, changed: false }
    }
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

// ---------------------------------------------------------------------------------------------
// Hold-aware allocator
// ---------------------------------------------------------------------------------------------

/*
 * Free count-layout capacity for a category after subtracting independently held capacity. Returns
 * null when the category is unbounded/untracked (no count entry), mirroring existing allocator
 * semantics where equipment without a capacity row is treated as unbounded.
 */
export function allocatableCount(
  parent: Container | StorageEquipment,
  category: string,
  childKind: CapacityChildKind,
  except?: ClaimOwner
): number | null {
  const limits = readCountCapacity(parent, category, childKind)
  if (!limits) return null
  const held = heldCapacityCount(parent, category, except)
  return Math.max(0, limits.capacity - limits.stored - held)
}

/* Free grid slots after subtracting cells reserved by live claims (never negative). */
export function allocatableGridSlots(
  parent: Container,
  entry: Extract<ContainerCapacityEntry, { layout: 'grid' }>,
  except?: ClaimOwner
): number {
  const total = entry.rows * entry.columns * (entry.levels ?? 1)
  return Math.max(0, total - entry.stored - heldGridCellCount(parent, except))
}

/*
 * Scan a grid parent row-major and return the first slot that is neither physically occupied (per
 * grid_occupancy) nor reserved by a live grid-cell claim, or null when none is free.
 */
export async function findFirstFreeUnheldGridSlot(
  parent: Container,
  entry: Extract<ContainerCapacityEntry, { layout: 'grid' }>,
  except?: ClaimOwner
): Promise<GridPosition | null> {
  const levels = entry.levels ?? 1
  for (let level = 1; level <= levels; level++) {
    for (let row = 1; row <= entry.rows; row++) {
      for (let column = 1; column <= entry.columns; column++) {
        const position = { row, column, level }
        if (isGridCellHeld(parent, position, except)) {
          continue
        }
        if (!(await isSlotOccupied(parent._id, position))) {
          return { row, column, level, label: deriveGridLabel(row, column, level) }
        }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Enforcement guards for ordinary inventory write boundaries
// ---------------------------------------------------------------------------------------------

/* Options allowing a specific step's own execution to pass a guard that blocks everyone else. */
export interface HoldEnforcementOptions {
  /* The activation permitted to write through the hold (its own execution consuming its claim). */
  allowActivationId?: string
  /* The executing step; parent-side claims are passable only by the exact step that owns them. */
  allowStepId?: string
}

/* The claim owner a set of enforcement options speaks for, or undefined for an ordinary writer. */
export function allowedClaimOwner(options: HoldEnforcementOptions = {}): ClaimOwner | undefined {
  return options.allowActivationId && options.allowStepId
    ? { activationId: options.allowActivationId, stepId: options.allowStepId }
    : undefined
}

/*
 * Server-only context passed by a task activation's execution into an ordinary inventory mutation
 * so it writes through its own holds and stamps the resulting action-log entry as a task receipt.
 * Never constructed from client input: the executing task service builds it from a validated
 * activation + step + operation.
 */
export interface InventoryExecutionContext {
  activationId: string
  stepId: string
  taskId: string
  operationId: string
  /* Executor-reported occurrence time; null falls back to the server recording time. */
  reportedAt: string | null
  source: 'scanner' | 'paper' | 'online'
}

/* Enforcement options that let an execution context's own step write through its holds. */
export function executionAllowance(execution?: InventoryExecutionContext): HoldEnforcementOptions {
  return execution ? { allowActivationId: execution.activationId, allowStepId: execution.stepId } : {}
}

/* The task-receipt fields to merge into an action-log entry produced by a task execution. */
export function executionReceiptFields(execution: InventoryExecutionContext, recordedAt: string): {
  linkedTaskId: string
  linkedStepId: string
  linkedActivationId: string
  operationId: string
  reportedAt: string
  source: 'scanner' | 'paper' | 'online'
} {
  return {
    linkedTaskId: execution.taskId,
    linkedStepId: execution.stepId,
    linkedActivationId: execution.activationId,
    operationId: execution.operationId,
    reportedAt: execution.reportedAt ?? recordedAt,
    source: execution.source
  }
}

/*
 * Refuse an ordinary write to an object that carries a live target hold. Only the execution of a
 * step that shares the hold may act on its own held target.
 */
export function assertTargetWritable(
  resource: Pick<HoldableResource, 'reservations'>,
  options: HoldEnforcementOptions = {}
): void {
  const hold = liveTargetHold(resource)
  if (!hold) return
  const ownStep = hold.activationId === options.allowActivationId
    && !!options.allowStepId
    && hold.stepIds.includes(options.allowStepId)
  if (!ownStep) {
    throw new ReservationConflictError()
  }
}

/*
 * Refuse occupying a grid cell reserved by a live claim, unless the caller is the step that owns the
 * claim. Called by the placement pre-check and the occupancy adjuster so an ordinary placement does
 * not land on a cell reserved for planned work.
 */
export function assertGridCellUnheld(
  parent: Pick<HoldableResource, 'reservations'>,
  position: { row: number, column: number, level?: number },
  options: HoldEnforcementOptions = {}
): void {
  if (isGridCellHeld(parent, position, allowedClaimOwner(options))) {
    throw new ReservationConflictError(
      `Slot (row ${position.row}, column ${position.column}, level ${position.level ?? 1}) is reserved for planned task work.`
    )
  }
}

/*
 * Refuse occupying count capacity that independently held claims already reserve. Called by the
 * ordinary count adjuster, enforcing physical + held ≤ capacity.
 */
export function assertCountCapacityNotOverHeld(
  parent: Container | StorageEquipment,
  category: string,
  childKind: CapacityChildKind,
  nextStored: number,
  options: HoldEnforcementOptions = {}
): void {
  const limits = readCountCapacity(parent, category, childKind)
  if (!limits) return
  const held = heldCapacityCount(parent, category, allowedClaimOwner(options))
  if (nextStored + held > limits.capacity) {
    throw new ReservationConflictError('Remaining capacity is reserved for planned task work.')
  }
}

/*
 * Refuse a capacity/grid edit that would take away something a live claim reserves: a claimed grid
 * cell that no longer exists, or count capacity that drops below what is stored plus reserved. Every
 * other edit (including growing, or shrinking around the claims) passes.
 */
export function assertCapacityEditKeepsClaims(
  before: Container | StorageEquipment,
  after: Container | StorageEquipment
): void {
  if (after.type === 'container') {
    const grid = after.capacity?.find(entry => entry.layout === 'grid')
    for (const claim of liveGridCellClaims(before)) {
      const stillThere = grid && grid.layout === 'grid'
        && isWithinGrid(claim.position, { rows: grid.rows, columns: grid.columns, levels: grid.levels ?? 1 })
      if (!stillThere) {
        throw new ReservationConflictError('This change would remove a grid cell that is reserved for planned task work.')
      }
    }
  }

  const categories = new Set(liveCapacityClaims(before).map(claim => claim.category))
  for (const category of categories) {
    const held = heldCapacityCount(before, category)
    const limitsBefore = readCountCapacity(before, category, 'container') ?? readCountCapacity(before, category, 'item')
    const limitsAfter = readCountCapacity(after, category, 'container') ?? readCountCapacity(after, category, 'item')
    if (limitsBefore && !limitsAfter) {
      throw new ReservationConflictError(`Capacity for "${category}" is reserved for planned task work and cannot be removed.`)
    }
    if (limitsAfter && limitsAfter.stored + held > limitsAfter.capacity) {
      throw new ReservationConflictError(
        `Capacity for "${category}" cannot drop below ${limitsAfter.stored + held}: ${held} slot(s) are reserved for planned task work.`
      )
    }
  }
}

/* Narrow guard used by callers/tests to recognise this module's conflict error. */
export function isReservationConflict(error: unknown): error is ReservationConflictError {
  return error instanceof ReservationConflictError
}
