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

import { couchDB } from '~~/server/database/couchdb'
import type { ContainerCapacityEntry } from '~~/schemas/inventory/container'
import type {
  Container,
  GridPosition,
  StorageEquipment
} from '../../../types/inventory'
import {
  compactReservations,
  heldCapacityCount,
  type HoldableResource,
  isGridCellHeld,
  isLiveState,
  liveStructuralGuards,
  liveTargetHold,
  normalizeReservations
} from './reservationState'
import { deriveGridLabel, isSlotOccupied } from './grid.server'

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
  executorFirnId: string
}

/* Whether a CouchDB error is a document-revision (409) conflict. */
export function isCouchConflict(error: unknown): boolean {
  const err = error as { code?: number, status?: number, statusCode?: number } | null
  return err?.code === 409 || err?.status === 409 || err?.statusCode === 409
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
 * Acquire the object-level target hold on an item/container. Idempotent for the same activation/step;
 * a hold owned by a different activation is refused. The generation is recorded (advances on handover)
 * but is not used to fence writers.
 */
export async function acquireTargetHold(resourceId: string, ctx: TargetHoldContext): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const existing = state.targetHold
    if (existing && isLiveState(existing.state)) {
      const ownedByCaller = existing.activationId === ctx.activationId && existing.stepId === ctx.stepId
      if (!ownedByCaller) {
        throw new ReservationConflictError()
      }
      if (existing.generation === ctx.generation && existing.state === 'held') {
        return { doc, changed: false }
      }
    }
    state.targetHold = {
      activationId: ctx.activationId,
      stepId: ctx.stepId,
      executorFirnId: ctx.executorFirnId,
      generation: ctx.generation,
      state: 'held',
      operationId: ctx.operationId
    }
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

/* Mark the target hold consumed (physical change committed). Still live until released. Idempotent. */
export async function consumeTargetHold(resourceId: string, ctx: HoldClaimContext): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const hold = state.targetHold
    if (!hold || !isLiveState(hold.state)) {
      return { doc, changed: false }
    }
    if (hold.activationId !== ctx.activationId || hold.stepId !== ctx.stepId) {
      throw new ReservationConflictError()
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

/* Release the target hold (drops it). Idempotent; only the owning activation may release it. */
export async function releaseTargetHold(resourceId: string, ctx: HoldClaimContext): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const hold = state.targetHold
    if (!hold || !isLiveState(hold.state)) {
      return { doc, changed: false }
    }
    if (hold.activationId !== ctx.activationId || hold.stepId !== ctx.stepId) {
      throw new ReservationConflictError()
    }
    hold.state = 'released'
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
 * parent, so re-claiming a different cell replaces the prior one. A cell already held by another
 * activation is refused.
 */
export async function acquireGridCellClaim(
  parentId: string,
  position: GridPosition,
  ctx: HoldClaimContext
): Promise<HoldableResource> {
  return mutateHoldable(parentId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const existingForStep = state.gridCells.find(
      claim => claim.activationId === ctx.activationId && claim.stepId === ctx.stepId && isLiveState(claim.state)
    )
    if (existingForStep && samePosition(existingForStep.position, position)) {
      return { doc, changed: false }
    }
    if (isGridCellHeld(doc, position, ctx.activationId)) {
      throw new ReservationConflictError()
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
      const otherHeld = heldCapacityCount(doc, category, ctx.activationId)
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
// Structural guards (stabilize a held subtree/path against incompatible edits)
// ---------------------------------------------------------------------------------------------

/* Acquire a structural guard on a resource/ancestor. Idempotent for the same activation/step/scope. */
export async function acquireStructuralGuard(
  resourceId: string,
  scope: 'subtree' | 'definition',
  ctx: HoldClaimContext
): Promise<HoldableResource> {
  return mutateHoldable(resourceId, (doc) => {
    const state = normalizeReservations(doc.reservations)
    const existing = state.structuralGuards.find(
      guard => guard.activationId === ctx.activationId && guard.stepId === ctx.stepId && guard.scope === scope && isLiveState(guard.state)
    )
    if (existing) {
      return { doc, changed: false }
    }
    state.structuralGuards.push({
      activationId: ctx.activationId,
      stepId: ctx.stepId,
      scope,
      generation: ctx.generation,
      state: 'held',
      operationId: ctx.operationId
    })
    doc.reservations = compactReservations(state)
    return { doc, changed: true }
  })
}

// ---------------------------------------------------------------------------------------------
// Generic claim release (grid cell / capacity / structural, by activation + step)
// ---------------------------------------------------------------------------------------------

/*
 * Release every live parent-side claim (grid cell, capacity, structural guard) recorded for one
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
    const before = state.gridCells.length + state.capacityClaims.length + state.structuralGuards.length
    state.gridCells = state.gridCells.filter(claim => !(owns(claim) && isLiveState(claim.state)))
    state.capacityClaims = state.capacityClaims.filter(claim => !(owns(claim) && isLiveState(claim.state)))
    state.structuralGuards = state.structuralGuards.filter(guard => !(owns(guard) && isLiveState(guard.state)))
    const after = state.gridCells.length + state.capacityClaims.length + state.structuralGuards.length
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
  exceptActivationId?: string
): number | null {
  const limits = readCountCapacity(parent, category, childKind)
  if (!limits) return null
  const held = heldCapacityCount(parent, category, exceptActivationId)
  return Math.max(0, limits.capacity - limits.stored - held)
}

/*
 * Scan a grid parent row-major and return the first slot that is neither physically occupied (per
 * grid_occupancy) nor held by another activation's live grid-cell claim, or null when none is free.
 */
export async function findFirstFreeUnheldGridSlot(
  parent: Container,
  entry: Extract<ContainerCapacityEntry, { layout: 'grid' }>,
  exceptActivationId?: string
): Promise<GridPosition | null> {
  const levels = entry.levels ?? 1
  for (let level = 1; level <= levels; level++) {
    for (let row = 1; row <= entry.rows; row++) {
      for (let column = 1; column <= entry.columns; column++) {
        const position = { row, column, level }
        if (isGridCellHeld(parent, position, exceptActivationId)) {
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

/* Options allowing a specific activation's own execution to pass a guard that blocks everyone else. */
export interface HoldEnforcementOptions {
  /* The activation permitted to write through the hold (its own execution consuming its claim). */
  allowActivationId?: string
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

/* Enforcement options that let an execution context's own activation write through its holds. */
export function executionAllowance(execution?: InventoryExecutionContext): HoldEnforcementOptions {
  return execution ? { allowActivationId: execution.activationId } : {}
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
 * Refuse an ordinary write to an object that carries a live target hold owned by a different
 * activation. The owning execution passes `allowActivationId` to act on its own held target.
 */
export function assertTargetWritable(
  resource: Pick<HoldableResource, 'reservations'>,
  options: HoldEnforcementOptions = {}
): void {
  const hold = liveTargetHold(resource)
  if (hold && hold.activationId !== options.allowActivationId) {
    throw new ReservationConflictError()
  }
}

/*
 * Refuse an incompatible structural change (capacity/grid/type/temperature/acceptance edit, move,
 * delete, deactivate) to a resource that any other activation guards. The guarding activation's own
 * execution may pass `allowActivationId`.
 */
export function assertNoBlockingStructuralGuard(
  resource: Pick<HoldableResource, 'reservations'>,
  options: HoldEnforcementOptions = {}
): void {
  const blocking = liveStructuralGuards(resource).some(guard => guard.activationId !== options.allowActivationId)
  if (blocking) {
    throw new ReservationConflictError()
  }
}

/*
 * Refuse occupying a grid cell held by another activation. Called by the ordinary occupancy adjuster
 * so an ordinary placement does not land on a cell reserved for planned work.
 */
export function assertGridCellUnheld(
  parent: Pick<HoldableResource, 'reservations'>,
  position: { row: number, column: number, level?: number },
  options: HoldEnforcementOptions = {}
): void {
  if (isGridCellHeld(parent, position, options.allowActivationId)) {
    throw new ReservationConflictError()
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
  const held = heldCapacityCount(parent, category, options.allowActivationId)
  if (nextStored + held > limits.capacity) {
    throw new ReservationConflictError('Remaining capacity is reserved for planned task work.')
  }
}

/* Narrow guard used by callers/tests to recognise this module's conflict error. */
export function isReservationConflict(error: unknown): error is ReservationConflictError {
  return error instanceof ReservationConflictError
}
