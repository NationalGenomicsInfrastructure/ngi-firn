/*
 * ActionService - Table of Contents
 * ********************************
 *
 * INTERNAL HELPERS:
 * toErrorMessage(error, context) - Normalize unknown failures into contextual errors
 * asRecord(value) - Safely coerce unknown details payload into object form
 * getDetailString(details, key) - Read non-empty string values from details payload
 * getPlannedTimestamp(action) - Derive planning timestamp for ordering/filtering
 * toInventoryActionTargetType(type) - Validate legal action target types
 * toLocationType(type) - Validate legal location types
 * isPendingAction(action) - Check if action is pending
 * isTerminalStatus(status) - Check if action is terminal
 * ensureViewsReady() - Ensure required view docs are available before view queries
 * getActionByIdOrThrow(actionId) - Load one action or throw
 * ensureActionCanTransition(action, nextStatus) - Enforce valid state transitions
 * listPendingActions(limit?) - Query pending actions through views
 *
 * ACTION CRUD + WORKFLOWS:
 * createAction(input, userId) - Persist a new action entry
 * getAction(actionId) - Resolve action by doc ID or business actionId
 * getActionsForTarget(targetId, limit?) - List action history for one target
 * getPlannedActions(filters?) - List planned actions with optional filtering
 * getOverdueActions() - List actions overdue as of now
 * completeAction(actionId, userId, notes?) - Complete an action
 * skipAction(actionId, userId, reason?) - Mark an action as skipped/cancelled
 * cancelAction(actionId, userId) - Cancel an action
 * createLinkedReturnAction(checkoutActionId, itemId, userId, dueAt?) - Create planned return tied to checkout
 * skipActionsForTarget(targetId, reason) - Bulk skip pending actions for a target
 * createExpiryActions(beforeDate) - Create pending expiry actions for expiring items
 */

import type { CloudantV1 } from '@ibm-cloud/cloudant'
import { couchDB } from '../database/couchdb'
import { ensureInventoryViews, generateInventoryId } from './inventory-helpers.server'
import type {
  CreateInventoryActionInput,
  InventoryAction,
  InventoryActionType,
  InventoryItem,
  InventoryLocationType
} from '../../types/inventory'

type InventoryActionDocument = InventoryAction & {
  plannedFor?: string | null
  assignee?: string | null
}

const MAX_ACTION_FETCH = 500
let viewsReadyPromise: Promise<void> | null = null

/* Convert unknown errors into explicit context-rich Error instances. */
function toErrorMessage(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return new Error(`${context}: ${error.message}`)
  }
  return new Error(`${context}: Unknown error`)
}

/* Safely coerce unknown payload values to object records. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

/* Read a non-empty string field from an action details payload. */
function getDetailString(details: Record<string, unknown>, key: string): string | null {
  const value = details[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/* Derive the effective planning timestamp from explicit detail fields. */
function getPlannedTimestamp(action: InventoryActionDocument): string | null {
  const details = asRecord(action.details)
  const dueAt = getDetailString(details, 'dueAt')
  const plannedForInDetails = getDetailString(details, 'plannedFor')
  const plannedFor = typeof action.plannedFor === 'string' && action.plannedFor.trim().length > 0
    ? action.plannedFor
    : null

  return dueAt ?? plannedFor ?? plannedForInDetails ?? action.performedAt ?? null
}

/* Validate a value as a supported InventoryAction target type. */
function toInventoryActionTargetType(type: unknown): InventoryAction['targetType'] | null {
  return type === 'room' || type === 'storageEquipment' || type === 'container' || type === 'inventoryItem'
    ? type
    : null
}

/* Validate a value as a supported inventory location type. */
function toLocationType(type: unknown): InventoryLocationType | null {
  return type === 'room' || type === 'storageEquipment' || type === 'container'
    ? type
    : null
}

/* Check whether an action is currently pending. */
function isPendingAction(action: InventoryActionDocument): boolean {
  return action.status === 'pending'
}

/* Check whether a status is terminal and no longer mutable. */
function isTerminalStatus(status: InventoryAction['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}

/* Lazily initialize and cache CouchDB view setup. */
async function ensureViewsReady(): Promise<void> {
  if (!viewsReadyPromise) {
    viewsReadyPromise = ensureInventoryViews().catch((error) => {
      viewsReadyPromise = null
      throw error
    })
  }
  await viewsReadyPromise
}

/* Fetch an action and fail fast when it cannot be found. */
async function getActionByIdOrThrow(actionId: string): Promise<InventoryActionDocument> {
  const action = await ActionService.getAction(actionId)
  if (!action) {
    throw new Error(`Inventory action "${actionId}" not found`)
  }
  return action as InventoryActionDocument
}

/* Guard invalid status transitions for immutable terminal actions. */
function ensureActionCanTransition(action: InventoryActionDocument, nextStatus: InventoryAction['status']): void {
  if (action.status === nextStatus) {
    return
  }

  if (isTerminalStatus(action.status)) {
    throw new Error(`Action "${action.actionId}" is already "${action.status}" and cannot transition to "${nextStatus}"`)
  }
}

/* Load pending actions from the inventory-actions by_status view. */
async function listPendingActions(limit = MAX_ACTION_FETCH): Promise<InventoryActionDocument[]> {
  await ensureViewsReady()

  const pendingRows = await couchDB.queryView<[InventoryAction['status'], string | null], null, InventoryActionDocument>(
    'inventory-actions',
    'by_status',
    {
      startkey: ['pending', null],
      endkey: ['pending', '\ufff0'],
      include_docs: true,
      limit
    }
  )

  return pendingRows.rows
    .map(row => row.doc)
    .filter((doc): doc is InventoryActionDocument => Boolean(doc && doc.type === 'inventoryAction'))
}

export const ActionService = {
  /* Create a new action with normalized defaults and persisted details. */
  async createAction(input: CreateInventoryActionInput, userId: string): Promise<InventoryAction> {
    try {
      const now = new Date().toISOString()
      const details = asRecord(input.details)
      const createdAction: Omit<InventoryAction, '_id' | '_rev'> = {
        type: 'inventoryAction',
        schema: 1,
        actionId: input.actionId || generateInventoryId('inventory-action'),
        actionType: input.actionType,
        status: input.status ?? 'pending',
        targetId: input.targetId,
        targetType: input.targetType,
        fromParentId: input.fromParentId ?? null,
        fromParentType: input.fromParentType ?? null,
        toParentId: input.toParentId ?? null,
        toParentType: input.toParentType ?? null,
        fromPosition: input.fromPosition ?? null,
        toPosition: input.toPosition ?? null,
        performedBy: userId,
        performedAt: input.performedAt ?? now,
        comment: input.comment ?? null,
        details: Object.keys(details).length > 0 ? details : null
      }

      const createdDoc = await couchDB.createDocument(createdAction)
      const action = await couchDB.getDocument<InventoryActionDocument>(createdDoc.id)
      if (!action || action.type !== 'inventoryAction') {
        throw new Error('Inventory action was created but could not be loaded')
      }

      return action
    }
    catch (error: unknown) {
      throw toErrorMessage(error, 'Failed to create inventory action')
    }
  },

  /* Resolve an action by document ID first, then by business actionId fallback. */
  async getAction(actionId: string): Promise<InventoryAction | null> {
    try {
      const byDocumentId = await couchDB.getDocument<InventoryActionDocument>(actionId)
      if (byDocumentId && byDocumentId.type === 'inventoryAction') {
        return byDocumentId
      }

      const byActionId = await couchDB.queryDocuments<InventoryActionDocument>({
        type: 'inventoryAction',
        actionId
      })

      return byActionId.find(action => action.type === 'inventoryAction') ?? null
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to get inventory action "${actionId}"`)
    }
  },

  /* Return action history for a target, preferring view-backed access paths. */
  async getActionsForTarget(targetId: string, limit = 100): Promise<InventoryAction[]> {
    try {
      await ensureViewsReady()

      const targetDoc = await couchDB.getDocument<CloudantV1.Document & { type?: string }>(targetId)
      const targetType = toInventoryActionTargetType(targetDoc?.type)

      if (targetType) {
        const byTarget = await couchDB.queryView<[InventoryAction['targetType'], string], null, InventoryActionDocument>(
          'inventory-actions',
          'by_target',
          {
            key: [targetType, targetId],
            include_docs: true,
            limit
          }
        )

        return byTarget.rows
          .map(row => row.doc)
          .filter((doc): doc is InventoryActionDocument => Boolean(doc && doc.type === 'inventoryAction'))
          .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
      }

      const fallback = await couchDB.queryDocuments<InventoryActionDocument>({
        type: 'inventoryAction',
        targetId
      })

      return fallback
        .filter(doc => doc.type === 'inventoryAction')
        .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
        .slice(0, limit)
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to get actions for target "${targetId}"`)
    }
  },

  /* Return pending/planned actions filtered by assignee, target, type, and overdue cutoff. */
  async getPlannedActions(
    filters?: {
      assignedTo?: string
      targetId?: string
      actionType?: InventoryActionType
      overdueBefore?: string
    }
  ): Promise<InventoryAction[]> {
    try {
      const pendingActions = await listPendingActions()
      const overdueBefore = filters?.overdueBefore ?? null

      return pendingActions
        .filter((action) => {
          if (filters?.targetId && action.targetId !== filters.targetId) {
            return false
          }

          if (filters?.actionType && action.actionType !== filters.actionType) {
            return false
          }

          if (filters?.assignedTo) {
            const details = asRecord(action.details)
            const assignee = (typeof action.assignee === 'string' && action.assignee)
              || getDetailString(details, 'assignedTo')
              || getDetailString(details, 'assignee')
              || null

            if (assignee !== filters.assignedTo) {
              return false
            }
          }

          if (overdueBefore) {
            const plannedAt = getPlannedTimestamp(action)
            if (!plannedAt || plannedAt >= overdueBefore) {
              return false
            }
          }

          return true
        })
        .sort((a, b) => {
          const plannedA = getPlannedTimestamp(a) ?? a.performedAt
          const plannedB = getPlannedTimestamp(b) ?? b.performedAt
          return plannedA.localeCompare(plannedB)
        })
    }
    catch (error: unknown) {
      throw toErrorMessage(error, 'Failed to get planned inventory actions')
    }
  },

  /* Convenience wrapper to fetch overdue planned actions as of now. */
  async getOverdueActions(): Promise<InventoryAction[]> {
    return this.getPlannedActions({ overdueBefore: new Date().toISOString() })
  },

  /* Transition an action to completed and record completion metadata. */
  async completeAction(actionId: string, userId: string, notes?: string): Promise<InventoryAction> {
    try {
      const action = await getActionByIdOrThrow(actionId)
      ensureActionCanTransition(action, 'completed')

      const now = new Date().toISOString()
      const details = asRecord(action.details)
      const updatedDetails: Record<string, unknown> = {
        ...details,
        completedBy: userId,
        completedAt: now
      }
      if (notes) {
        updatedDetails.completionNotes = notes
      }

      const updatedAction: InventoryActionDocument = {
        ...action,
        status: 'completed',
        performedAt: now,
        comment: notes ?? action.comment ?? null,
        details: updatedDetails
      }

      const result = await couchDB.updateDocument(action._id, updatedAction, action._rev)
      return { ...updatedAction, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to complete inventory action "${actionId}"`)
    }
  },

  /* Transition an action to cancelled/skipped and persist skip context. */
  async skipAction(actionId: string, userId: string, reason?: string): Promise<InventoryAction> {
    try {
      const action = await getActionByIdOrThrow(actionId)
      ensureActionCanTransition(action, 'cancelled')

      const now = new Date().toISOString()
      const details = asRecord(action.details)
      const updatedDetails: Record<string, unknown> = {
        ...details,
        skippedBy: userId,
        skippedAt: now
      }

      if (reason) {
        updatedDetails.skipReason = reason
      }

      const updatedAction: InventoryActionDocument = {
        ...action,
        status: 'cancelled',
        performedAt: now,
        comment: reason ?? action.comment ?? null,
        details: updatedDetails
      }

      const result = await couchDB.updateDocument(action._id, updatedAction, action._rev)
      return { ...updatedAction, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to skip inventory action "${actionId}"`)
    }
  },

  /* Cancel an action without additional skip-reason semantics. */
  async cancelAction(actionId: string, userId: string): Promise<InventoryAction> {
    try {
      const action = await getActionByIdOrThrow(actionId)
      ensureActionCanTransition(action, 'cancelled')

      const now = new Date().toISOString()
      const details = asRecord(action.details)
      const updatedDetails: Record<string, unknown> = {
        ...details,
        cancelledBy: userId,
        cancelledAt: now
      }

      const updatedAction: InventoryActionDocument = {
        ...action,
        status: 'cancelled',
        performedAt: now,
        details: updatedDetails
      }

      const result = await couchDB.updateDocument(action._id, updatedAction, action._rev)
      return { ...updatedAction, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to cancel inventory action "${actionId}"`)
    }
  },

  /* Create a planned return action linked to a checkout action. */
  async createLinkedReturnAction(
    checkoutActionId: string,
    itemId: string,
    userId: string,
    dueAt?: string
  ): Promise<InventoryAction> {
    try {
      const checkoutAction = await getActionByIdOrThrow(checkoutActionId)
      const details = asRecord(checkoutAction.details)

      const linkedDetails: Record<string, unknown> = {
        ...details,
        linkedCheckoutActionId: checkoutAction.actionId,
        relation: 'return'
      }

      if (dueAt) {
        linkedDetails.dueAt = dueAt
        linkedDetails.plannedFor = dueAt
      }

      const targetType = checkoutAction.targetType === 'inventoryItem' ? checkoutAction.targetType : 'inventoryItem'
      const fromParentType = toLocationType(checkoutAction.toParentType)
      const toParentType = toLocationType(checkoutAction.fromParentType)

      return this.createAction(
        {
          actionId: generateInventoryId('inventory-return'),
          actionType: 'move',
          status: 'pending',
          targetId: itemId,
          targetType,
          fromParentId: checkoutAction.toParentId ?? null,
          fromParentType,
          toParentId: checkoutAction.fromParentId ?? null,
          toParentType,
          fromPosition: checkoutAction.toPosition ?? null,
          toPosition: checkoutAction.fromPosition ?? null,
          performedBy: userId,
          performedAt: dueAt ?? new Date().toISOString(),
          comment: `Return action linked to checkout "${checkoutAction.actionId}"`,
          details: linkedDetails
        },
        userId
      )
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to create linked return action for "${checkoutActionId}"`)
    }
  },

  /* Bulk-skip all pending actions attached to a target entity. */
  async skipActionsForTarget(targetId: string, reason: string): Promise<number> {
    try {
      const actions = await this.getActionsForTarget(targetId, MAX_ACTION_FETCH)
      const now = new Date().toISOString()
      const pendingActions = actions
        .filter((action): action is InventoryActionDocument => action.type === 'inventoryAction' && isPendingAction(action))

      if (pendingActions.length === 0) {
        return 0
      }

      const docsToUpdate = pendingActions.map((action) => {
        const details = asRecord(action.details)
        return {
          ...action,
          status: 'cancelled' as const,
          performedAt: now,
          comment: reason || action.comment ?? null,
          details: {
            ...details,
            skipReason: reason,
            skippedAt: now
          }
        }
      })

      const result = await couchDB.bulkUpdateDocuments<CloudantV1.Document>(docsToUpdate as CloudantV1.Document[])
      return result.filter(entry => entry.ok && !entry.error).length
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to skip actions for target "${targetId}"`)
    }
  },

  /* Generate pending expiry actions for items expiring at/before the given cutoff. */
  async createExpiryActions(beforeDate: string): Promise<InventoryAction[]> {
    try {
      const parsedBeforeDate = new Date(beforeDate)
      if (Number.isNaN(parsedBeforeDate.getTime())) {
        throw new Error(`Invalid beforeDate "${beforeDate}"`)
      }

      const pendingActions = await listPendingActions()
      const existingPendingExpiryActions = new Set(
        pendingActions
          .filter(action => action.actionType === 'archive')
          .map(action => action.targetId)
      )

      const items = await couchDB.queryDocuments<InventoryItem>({
        type: 'inventoryItem'
      })

      const expiringItems = items.filter((item) => {
        if (item.status === 'archived' || item.status === 'depleted') {
          return false
        }

        const metadata = asRecord(item.metadata)
        const expiryDate = getDetailString(metadata, 'expiryDate')
        return Boolean(expiryDate && expiryDate <= beforeDate && !existingPendingExpiryActions.has(item._id))
      })

      const createdActions: InventoryAction[] = []
      for (const item of expiringItems) {
        const metadata = asRecord(item.metadata)
        const expiryDate = getDetailString(metadata, 'expiryDate')
        const action = await this.createAction(
          {
            actionId: generateInventoryId('inventory-expiry'),
            actionType: 'archive',
            status: 'pending',
            targetId: item._id,
            targetType: 'inventoryItem',
            performedBy: 'system',
            performedAt: parsedBeforeDate.toISOString(),
            comment: `Item expires before ${beforeDate}`,
            details: {
              reason: 'expiry',
              expiryDate,
              dueAt: expiryDate ?? beforeDate,
              plannedFor: expiryDate ?? beforeDate
            }
          },
          'system'
        )
        createdActions.push(action)
      }

      return createdActions
    }
    catch (error: unknown) {
      throw toErrorMessage(error, 'Failed to create expiry inventory actions')
    }
  }
}
