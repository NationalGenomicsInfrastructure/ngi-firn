/*
 * Reservation state normalizers
 * *****************************
 *
 * Pure helpers for the server-owned task-hold state embedded on inventory resource documents
 * (InventoryReservationState). They are deliberately free of CouchDB access so they can be reused
 * by the CAS write helpers, the hold-aware allocator and the enforcement guards without import
 * cycles. The CAS acquire/consume/release protocol lives in reservations.server.ts.
 *
 * Two invariants callers rely on:
 *  - a resource with no task holds normalizes to `null` (keeps documents small and backwards
 *    compatible with legacy documents that predate the field), and
 *  - a resource that only carries released/consumed-and-drained claims also collapses to `null`,
 *    so the common unheld path never pays for an empty ledger.
 */

import type {
  Container,
  InventoryCapacityClaim,
  InventoryGridCellClaim,
  InventoryItem,
  InventoryReservationState,
  InventoryStructuralGuard,
  InventoryTargetHold,
  StorageEquipment
} from '../../../types/inventory'

/*
 * Any inventory resource that can bear task holds. Rooms are intentionally excluded: they have no
 * capacity to claim and are never a step target, and held work nested beneath a room is already
 * protected transitively by the room's non-empty-delete/deactivate guards.
 */
export type HoldableResource = Container | InventoryItem | StorageEquipment

/* An explicit empty reservation ledger used when initializing a brand-new document. */
export function emptyReservationState(): InventoryReservationState {
  return { targetHold: null, gridCells: [], capacityClaims: [], structuralGuards: [] }
}

/*
 * Return the resource's reservation state with every array present (never undefined), defaulting a
 * missing/legacy field to an empty ledger. Does not mutate the input.
 */
export function normalizeReservations(state: InventoryReservationState | null | undefined): InventoryReservationState {
  if (!state) return emptyReservationState()
  return {
    targetHold: state.targetHold ?? null,
    gridCells: Array.isArray(state.gridCells) ? state.gridCells : [],
    capacityClaims: Array.isArray(state.capacityClaims) ? state.capacityClaims : [],
    structuralGuards: Array.isArray(state.structuralGuards) ? state.structuralGuards : []
  }
}

/* Whether a claim/hold is still live (occupies a hold slot). Released claims are inert. */
export function isLiveState(state: InventoryHoldLikeState): boolean {
  return state === 'pending' || state === 'held' || state === 'consumed'
}

/* Narrow structural type shared by every claim/hold `state` field. */
type InventoryHoldLikeState = InventoryTargetHold['state']

/*
 * Collapse a reservation ledger back to `null` when it holds nothing live. Dropping released claims
 * keeps the stored document small and means the unheld fast-path (reservations === null) stays valid
 * after the last hold is released.
 */
export function compactReservations(state: InventoryReservationState): InventoryReservationState | null {
  const targetHold = state.targetHold && isLiveState(state.targetHold.state) ? state.targetHold : null
  const gridCells = state.gridCells.filter(claim => isLiveState(claim.state))
  const capacityClaims = state.capacityClaims.filter(claim => isLiveState(claim.state))
  const structuralGuards = state.structuralGuards.filter(guard => isLiveState(guard.state))
  if (!targetHold && gridCells.length === 0 && capacityClaims.length === 0 && structuralGuards.length === 0) {
    return null
  }
  return { targetHold, gridCells, capacityClaims, structuralGuards }
}

/* Whether this resource currently carries a live object-level target hold. */
export function hasLiveTargetHold(resource: Pick<HoldableResource, 'reservations'>): boolean {
  const hold = resource.reservations?.targetHold
  return !!hold && isLiveState(hold.state)
}

/* The live object-level target hold, or null. */
export function liveTargetHold(resource: Pick<HoldableResource, 'reservations'>): InventoryTargetHold | null {
  const hold = resource.reservations?.targetHold
  return hold && isLiveState(hold.state) ? hold : null
}

/* Live grid-cell claims recorded on a parent grid container. */
export function liveGridCellClaims(resource: Pick<HoldableResource, 'reservations'>): InventoryGridCellClaim[] {
  return (resource.reservations?.gridCells ?? []).filter(claim => isLiveState(claim.state))
}

/* Live category/count capacity claims recorded on a parent (container or equipment). */
export function liveCapacityClaims(resource: Pick<HoldableResource, 'reservations'>): InventoryCapacityClaim[] {
  return (resource.reservations?.capacityClaims ?? []).filter(claim => isLiveState(claim.state))
}

/* Live structural guards recorded on a resource/subtree. */
export function liveStructuralGuards(resource: Pick<HoldableResource, 'reservations'>): InventoryStructuralGuard[] {
  return (resource.reservations?.structuralGuards ?? []).filter(guard => isLiveState(guard.state))
}

/* Whether a specific grid cell is held by any live claim (optionally excluding one activation). */
export function isGridCellHeld(
  resource: Pick<HoldableResource, 'reservations'>,
  position: { row: number, column: number, level?: number },
  exceptActivationId?: string
): boolean {
  const level = position.level ?? 1
  return liveGridCellClaims(resource).some(claim =>
    claim.activationId !== exceptActivationId
    && claim.position.row === position.row
    && claim.position.column === position.column
    && (claim.position.level ?? 1) === level
  )
}

/*
 * Total count of live capacity claims for a category (optionally excluding one activation). Used by
 * the hold-aware allocator to subtract independently held capacity from a parent's free slots.
 */
export function heldCapacityCount(
  resource: Pick<HoldableResource, 'reservations'>,
  category: string,
  exceptActivationId?: string
): number {
  return liveCapacityClaims(resource)
    .filter(claim => claim.category === category && claim.activationId !== exceptActivationId)
    .reduce((sum, claim) => sum + claim.count, 0)
}
