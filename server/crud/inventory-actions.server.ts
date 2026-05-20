/*
 * ActionService - Table of Contents
 * ********************************
 *
 * INTERNAL HELPERS:
 * toErrorMessage(error, context) - Normalize unknown failures into contextual errors
 * toInventoryActionTargetType(type) - Validate legal action target types
 * isPendingAction(action) - Check if action has planned status
 * isTerminalStatus(status) - Check if action is terminal
 * ensureViewsReady() - Ensure required view docs are available before view queries
 * getActionByIdOrThrow(actionId) - Load one action or throw
 * ensureActionCanTransition(action, nextStatus) - Enforce valid state transitions
 * resolveTargetName(targetId) - Snapshot target name for audit trail
 * listPlannedActions(limit?) - Query planned actions through views
 *
 * ACTION CRUD + WORKFLOWS:
 * createAction(input, userId) - Persist a new action entry
 * getAction(actionId) - Resolve action by doc ID or business actionId
 * getActionsForTarget(targetId, limit?) - List action history for one target
 * getPlannedActions(filters?) - List planned actions with optional filtering
 * getOverdueActions() - List actions overdue as of now
 * completeAction(actionId, userId, notes?) - Complete an action
 * skipAction(actionId, userId, reason?) - Mark an action as skipped
 * cancelAction(actionId, userId) - Cancel an action
 * createLinkedReturnAction(checkoutActionId, itemId, userId, dueAt?) - Create planned return tied to checkout
 * skipActionsForTarget(targetId, reason) - Bulk skip planned actions for a target
 * createExpiryActions(beforeDate) - Create planned expiry actions for expiring items
 */

import type { CloudantV1 } from '@ibm-cloud/cloudant'
import { couchDB } from '../database/couchdb'
import { ensureInventoryViews, generateInventoryId } from './inventory-helpers.server'
import type {
  CreateInventoryActionInput,
  InventoryAction,
  InventoryActionType,
  InventoryItem
} from '../../types/inventory'

const MAX_ACTION_FETCH = 500
let viewsReadyPromise: Promise<void> | null = null

/* Convert unknown errors into explicit context-rich Error instances. */
function toErrorMessage(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return new Error(`${context}: ${error.message}`)
  }
  return new Error(`${context}: Unknown error`)
}

/* Validate a value as a supported InventoryAction target type. */
function toInventoryActionTargetType(type: unknown): InventoryAction['targetType'] | null {
  return type === 'room' || type === 'storageEquipment' || type === 'container' || type === 'inventoryItem'
    ? type
    : null
}

/* Check whether an action is currently planned (i.e. awaiting execution). */
function isPendingAction(action: InventoryAction): boolean {
  return action.status === 'planned'
}

/* Check whether a status is terminal and no longer mutable. */
function isTerminalStatus(status: InventoryAction['status']): boolean {
  return status === 'completed' || status === 'skipped' || status === 'cancelled'
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
async function getActionByIdOrThrow(actionId: string): Promise<InventoryAction> {
  const action = await ActionService.getAction(actionId)
  if (!action) {
    throw new Error(`Inventory action "${actionId}" not found`)
  }
  return action
}

/* Guard invalid status transitions for immutable terminal actions. */
function ensureActionCanTransition(action: InventoryAction, nextStatus: InventoryAction['status']): void {
  if (action.status === nextStatus) {
    return
  }

  if (isTerminalStatus(action.status)) {
    throw new Error(`Action "${action.actionId}" is already "${action.status}" and cannot transition to "${nextStatus}"`)
  }
}

/* Resolve the display name of a target document for audit snapshots. */
async function resolveTargetName(targetId: string): Promise<string> {
  try {
    const doc = await couchDB.getDocument<CloudantV1.Document & { name?: string }>(targetId)
    if (doc && typeof doc.name === 'string' && doc.name.length > 0) {
      return doc.name
    }
    return targetId
  }
  catch {
    return targetId
  }
}

/* Load planned actions from the inventory-actions by_status view. */
async function listPlannedActions(limit = MAX_ACTION_FETCH): Promise<InventoryAction[]> {
  await ensureViewsReady()

  const plannedRows = await couchDB.queryView<[InventoryAction['status'], string | null], null, InventoryAction>(
    'inventory-actions',
    'by_status',
    {
      startkey: ['planned', null],
      endkey: ['planned', '\ufff0'],
      include_docs: true,
      limit
    }
  )

  return plannedRows.rows
    .map(row => row.doc)
    .filter((doc): doc is InventoryAction => Boolean(doc && doc.type === 'inventoryAction'))
}

export const ActionService = {
  /* Create a new action with normalized defaults and target name snapshot. */
  async createAction(input: CreateInventoryActionInput, userId: string): Promise<InventoryAction> {
    try {
      const now = new Date().toISOString()
      const targetName = await resolveTargetName(input.targetId)
      const status = input.status ?? 'planned'

      const createdAction: Omit<InventoryAction, '_id' | '_rev'> = {
        type: 'inventoryAction',
        schema: 1,
        actionId: generateInventoryId('inventory-action'),
        actionType: input.actionType,
        status,
        targetId: input.targetId,
        targetType: input.targetType,
        targetName,
        createdBy: userId,
        assignedTo: input.assignedTo ?? null,
        completedBy: status === 'completed' ? userId : null,
        plannedAt: now,
        dueAt: input.dueAt ?? null,
        completedAt: status === 'completed' ? now : null,
        fromParentId: input.fromParentId ?? null,
        fromParentType: input.fromParentType ?? null,
        toParentId: input.toParentId ?? null,
        toParentType: input.toParentType ?? null,
        fromPosition: input.fromPosition ?? null,
        toPosition: input.toPosition ?? null,
        linkedActionId: input.linkedActionId ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null
      }

      const createdDoc = await couchDB.createDocument(createdAction)
      const action = await couchDB.getDocument<InventoryAction>(createdDoc.id)
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
      const byDocumentId = await couchDB.getDocument<InventoryAction>(actionId)
      if (byDocumentId && byDocumentId.type === 'inventoryAction') {
        return byDocumentId
      }

      const byActionId = await couchDB.queryDocuments<InventoryAction>({
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
        const byTarget = await couchDB.queryView<[InventoryAction['targetType'], string], null, InventoryAction>(
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
          .filter((doc): doc is InventoryAction => Boolean(doc && doc.type === 'inventoryAction'))
          .sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))
      }

      const fallback = await couchDB.queryDocuments<InventoryAction>({
        type: 'inventoryAction',
        targetId
      })

      return fallback
        .filter(doc => doc.type === 'inventoryAction')
        .sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))
        .slice(0, limit)
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to get actions for target "${targetId}"`)
    }
  },

  /* Return planned actions filtered by assignee, target, type, and overdue cutoff. */
  async getPlannedActions(
    filters?: {
      assignedTo?: string
      targetId?: string
      actionType?: InventoryActionType
      overdueBefore?: string
    }
  ): Promise<InventoryAction[]> {
    try {
      const plannedActions = await listPlannedActions()
      const overdueBefore = filters?.overdueBefore ?? null

      return plannedActions
        .filter((action) => {
          if (filters?.targetId && action.targetId !== filters.targetId) {
            return false
          }

          if (filters?.actionType && action.actionType !== filters.actionType) {
            return false
          }

          if (filters?.assignedTo) {
            if (action.assignedTo !== filters.assignedTo) {
              return false
            }
          }

          if (overdueBefore) {
            if (!action.dueAt || action.dueAt >= overdueBefore) {
              return false
            }
          }

          return true
        })
        .sort((a, b) => {
          const sortA = a.dueAt ?? a.plannedAt
          const sortB = b.dueAt ?? b.plannedAt
          return sortA.localeCompare(sortB)
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
      const updatedAction: InventoryAction = {
        ...action,
        status: 'completed',
        completedBy: userId,
        completedAt: now,
        notes: notes ?? action.notes
      }

      const result = await couchDB.updateDocument(action._id, updatedAction, action._rev)
      return { ...updatedAction, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to complete inventory action "${actionId}"`)
    }
  },

  /* Transition an action to skipped and persist skip context. */
  async skipAction(actionId: string, userId: string, reason?: string): Promise<InventoryAction> {
    try {
      const action = await getActionByIdOrThrow(actionId)
      ensureActionCanTransition(action, 'skipped')

      const now = new Date().toISOString()
      const updatedAction: InventoryAction = {
        ...action,
        status: 'skipped',
        completedBy: userId,
        completedAt: now,
        notes: reason ?? action.notes
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
      const updatedAction: InventoryAction = {
        ...action,
        status: 'cancelled',
        completedBy: userId,
        completedAt: now
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

      return this.createAction(
        {
          actionType: 'return',
          status: 'planned',
          targetId: itemId,
          targetType: checkoutAction.targetType === 'inventoryItem' ? checkoutAction.targetType : 'inventoryItem',
          assignedTo: userId,
          dueAt: dueAt ?? null,
          fromParentId: checkoutAction.toParentId ?? null,
          fromParentType: checkoutAction.toParentType ?? null,
          toParentId: checkoutAction.fromParentId ?? null,
          toParentType: checkoutAction.fromParentType ?? null,
          fromPosition: checkoutAction.toPosition ?? null,
          toPosition: checkoutAction.fromPosition ?? null,
          linkedActionId: checkoutAction.actionId,
          description: `Return action linked to checkout "${checkoutAction.actionId}"`
        },
        userId
      )
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to create linked return action for "${checkoutActionId}"`)
    }
  },

  /* Bulk-skip all planned actions attached to a target entity. */
  async skipActionsForTarget(targetId: string, reason: string): Promise<number> {
    try {
      const actions = await this.getActionsForTarget(targetId, MAX_ACTION_FETCH)
      const now = new Date().toISOString()
      const plannedActions = actions
        .filter((action): action is InventoryAction => action.type === 'inventoryAction' && isPendingAction(action))

      if (plannedActions.length === 0) {
        return 0
      }

      const docsToUpdate = plannedActions.map((action) => {
        return {
          ...action,
          status: 'skipped' as const,
          completedBy: 'system',
          completedAt: now,
          notes: reason || action.notes
        }
      })

      const result = await couchDB.bulkUpdateDocuments<CloudantV1.Document>(docsToUpdate as unknown as CloudantV1.Document[])
      return result.filter(entry => entry.ok && !entry.error).length
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to skip actions for target "${targetId}"`)
    }
  },

  /* Generate planned expiry actions for items expiring at/before the given cutoff. */
  async createExpiryActions(beforeDate: string): Promise<InventoryAction[]> {
    try {
      const parsedBeforeDate = new Date(beforeDate)
      if (Number.isNaN(parsedBeforeDate.getTime())) {
        throw new Error(`Invalid beforeDate "${beforeDate}"`)
      }

      const plannedActions = await listPlannedActions()
      const existingExpiryTargets = new Set(
        plannedActions
          .filter(action => action.actionType === 'discard_expired')
          .map(action => action.targetId)
      )

      const items = await couchDB.queryDocuments<InventoryItem>({
        type: 'inventoryItem'
      })

      const expiringItems = items.filter((item) => {
        if (item.status === 'disposed' || item.status === 'expired') {
          return false
        }

        return Boolean(item.expiryDate && item.expiryDate <= beforeDate && !existingExpiryTargets.has(item._id))
      })

      const createdActions: InventoryAction[] = []
      for (const item of expiringItems) {
        const action = await this.createAction(
          {
            actionType: 'discard_expired',
            status: 'planned',
            targetId: item._id,
            targetType: 'inventoryItem',
            dueAt: item.expiryDate ?? beforeDate,
            description: `Item expires before ${beforeDate}`
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
