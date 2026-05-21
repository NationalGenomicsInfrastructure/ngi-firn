/*
 * TaskService - Table of Contents
 * ********************************
 *
 * INTERNAL HELPERS:
 * toErrorMessage(error, context) - Normalize unknown failures into contextual errors
 * toInventoryTaskTargetType(type) - Validate legal task target types
 * isPendingTask(task) - Check if task has planned status
 * isTerminalStatus(status) - Check if task is terminal
 * ensureViewsReady() - Ensure required view docs are available before view queries
 * getTaskByIdOrThrow(taskId) - Load one task or throw
 * ensureTaskCanTransition(task, nextStatus) - Enforce valid state transitions
 * listPlannedTasks(limit?) - Query planned tasks through views
 *
 * TASK CRUD + WORKFLOWS:
 * createTask(input, userId) - Persist a new task entry
 * getTask(taskId) - Resolve task by doc ID or business taskId
 * getTasksForTarget(targetId, limit?) - List task history for one target
 * getPlannedTasks(filters?) - List planned tasks with optional filtering
 * getOverdueTasks() - List tasks overdue as of now
 * completeTask(taskId, userId, notes?) - Complete a task and append action log to target
 * skipTask(taskId, userId, reason?) - Mark a task as skipped
 * cancelTask(taskId, userId) - Cancel a task
 * createLinkedReturnTask(checkoutTaskId, itemId, userId, dueAt?) - Create planned return tied to checkout
 * skipTasksForTarget(targetId, reason) - Bulk skip planned tasks for a target
 * createExpiryTasks(beforeDate) - Create planned expiry tasks for expiring items
 */

import type { CloudantV1 } from '@ibm-cloud/cloudant'
import { couchDB } from '../database/couchdb'
import { ensureInventoryViews, generateInventoryId } from './inventory-helpers.server'
import type {
  ActionLogEntry,
  CreateInventoryTaskInput,
  InventoryActionType,
  InventoryItem,
  InventoryTask
} from '../../types/inventory'

const MAX_TASK_FETCH = 500
let viewsReadyPromise: Promise<void> | null = null

/* Convert unknown errors into explicit context-rich Error instances. */
function toErrorMessage(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return new Error(`${context}: ${error.message}`)
  }
  return new Error(`${context}: Unknown error`)
}

/* Validate a value as a supported InventoryTask target type. */
function toInventoryTaskTargetType(type: unknown): InventoryTask['targetType'] | null {
  return type === 'room' || type === 'storageEquipment' || type === 'container' || type === 'inventoryItem'
    ? type
    : null
}

/* Check whether a task is currently planned (i.e. awaiting execution). */
function isPendingTask(task: InventoryTask): boolean {
  return task.status === 'planned'
}

/* Check whether a status is terminal and no longer mutable. */
function isTerminalStatus(status: InventoryTask['status']): boolean {
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

/* Fetch a task and fail fast when it cannot be found. */
async function getTaskByIdOrThrow(taskId: string): Promise<InventoryTask> {
  const task = await TaskService.getTask(taskId)
  if (!task) {
    throw new Error(`Inventory task "${taskId}" not found`)
  }
  return task
}

/* Guard invalid status transitions for immutable terminal tasks. */
function ensureTaskCanTransition(task: InventoryTask, nextStatus: InventoryTask['status']): void {
  if (task.status === nextStatus) {
    return
  }

  if (isTerminalStatus(task.status)) {
    throw new Error(`Task "${task.taskId}" is already "${task.status}" and cannot transition to "${nextStatus}"`)
  }
}

/* Load planned tasks from the inventory-actions by_status view. */
async function listPlannedTasks(limit = MAX_TASK_FETCH): Promise<InventoryTask[]> {
  await ensureViewsReady()

  const plannedRows = await couchDB.queryView<[InventoryTask['status'], string | null], null, InventoryTask>(
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
    .filter((doc): doc is InventoryTask => Boolean(doc && doc.type === 'inventoryTask'))
}

export const TaskService = {
  /* Create a new task with normalized defaults. */
  async createTask(input: CreateInventoryTaskInput, userId: string): Promise<InventoryTask> {
    try {
      const now = new Date().toISOString()
      const status = input.status ?? 'planned'

      const createdTask: Omit<InventoryTask, '_id' | '_rev'> = {
        type: 'inventoryTask',
        schema: 1,
        taskId: generateInventoryId('inventory-task'),
        actionType: input.actionType,
        status,
        targetId: input.targetId,
        targetType: input.targetType,
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
        linkedTaskId: input.linkedTaskId ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null
      }

      const createdDoc = await couchDB.createDocument(createdTask)
      const task = await couchDB.getDocument<InventoryTask>(createdDoc.id)
      if (!task || task.type !== 'inventoryTask') {
        throw new Error('Inventory task was created but could not be loaded')
      }

      return task
    }
    catch (error: unknown) {
      throw toErrorMessage(error, 'Failed to create inventory task')
    }
  },

  /* Resolve a task by document ID first, then by business taskId fallback. */
  async getTask(taskId: string): Promise<InventoryTask | null> {
    try {
      const byDocumentId = await couchDB.getDocument<InventoryTask>(taskId)
      if (byDocumentId && byDocumentId.type === 'inventoryTask') {
        return byDocumentId
      }

      const byTaskId = await couchDB.queryDocuments<InventoryTask>({
        type: 'inventoryTask',
        taskId
      })

      return byTaskId.find(task => task.type === 'inventoryTask') ?? null
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to get inventory task "${taskId}"`)
    }
  },

  /* Return task history for a target, preferring view-backed access paths. */
  async getTasksForTarget(targetId: string, limit = 100): Promise<InventoryTask[]> {
    try {
      await ensureViewsReady()

      const targetDoc = await couchDB.getDocument<CloudantV1.Document & { type?: string }>(targetId)
      const targetType = toInventoryTaskTargetType(targetDoc?.type)

      if (targetType) {
        const byTarget = await couchDB.queryView<[InventoryTask['targetType'], string], null, InventoryTask>(
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
          .filter((doc): doc is InventoryTask => Boolean(doc && doc.type === 'inventoryTask'))
          .sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))
      }

      const fallback = await couchDB.queryDocuments<InventoryTask>({
        type: 'inventoryTask',
        targetId
      })

      return fallback
        .filter(doc => doc.type === 'inventoryTask')
        .sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))
        .slice(0, limit)
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to get tasks for target "${targetId}"`)
    }
  },

  /* Return planned tasks filtered by assignee, target, type, and overdue cutoff. */
  async getPlannedTasks(
    filters?: {
      assignedTo?: string
      targetId?: string
      actionType?: InventoryActionType
      overdueBefore?: string
    }
  ): Promise<InventoryTask[]> {
    try {
      const plannedTasks = await listPlannedTasks()
      const overdueBefore = filters?.overdueBefore ?? null

      return plannedTasks
        .filter((task) => {
          if (filters?.targetId && task.targetId !== filters.targetId) {
            return false
          }

          if (filters?.actionType && task.actionType !== filters.actionType) {
            return false
          }

          if (filters?.assignedTo) {
            if (task.assignedTo !== filters.assignedTo) {
              return false
            }
          }

          if (overdueBefore) {
            if (!task.dueAt || task.dueAt >= overdueBefore) {
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
      throw toErrorMessage(error, 'Failed to get planned inventory tasks')
    }
  },

  /* Convenience wrapper to fetch overdue planned tasks as of now. */
  async getOverdueTasks(): Promise<InventoryTask[]> {
    return this.getPlannedTasks({ overdueBefore: new Date().toISOString() })
  },

  /* Transition a task to completed, record completion metadata, and append action log to target. */
  async completeTask(taskId: string, userId: string, notes?: string): Promise<InventoryTask> {
    try {
      const task = await getTaskByIdOrThrow(taskId)
      ensureTaskCanTransition(task, 'completed')

      const now = new Date().toISOString()
      const updatedTask: InventoryTask = {
        ...task,
        status: 'completed',
        completedBy: userId,
        completedAt: now,
        notes: notes ?? task.notes
      }

      const result = await couchDB.updateDocument(task._id, updatedTask, task._rev)

      // After marking task completed, append log entry to target
      const target = await couchDB.getDocument<CloudantV1.Document & { actionLog?: ActionLogEntry[] }>(task.targetId)
      if (target) {
        const log: ActionLogEntry = {
          actionType: task.actionType,
          userId,
          timestamp: now,
          notes: notes ?? task.notes ?? undefined,
          fromParentId: task.fromParentId ?? undefined,
          toParentId: task.toParentId ?? undefined,
          linkedTaskId: task.taskId
        }
        const updatedLog = [...(target.actionLog || []), log]
        await couchDB.updateDocument(target._id!, { ...target, actionLog: updatedLog }, target._rev!)
      }

      return { ...updatedTask, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to complete inventory task "${taskId}"`)
    }
  },

  /* Transition a task to skipped and persist skip context. */
  async skipTask(taskId: string, userId: string, reason?: string): Promise<InventoryTask> {
    try {
      const task = await getTaskByIdOrThrow(taskId)
      ensureTaskCanTransition(task, 'skipped')

      const now = new Date().toISOString()
      const updatedTask: InventoryTask = {
        ...task,
        status: 'skipped',
        completedBy: userId,
        completedAt: now,
        notes: reason ?? task.notes
      }

      const result = await couchDB.updateDocument(task._id, updatedTask, task._rev)
      return { ...updatedTask, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to skip inventory task "${taskId}"`)
    }
  },

  /* Cancel a task without additional skip-reason semantics. */
  async cancelTask(taskId: string, userId: string): Promise<InventoryTask> {
    try {
      const task = await getTaskByIdOrThrow(taskId)
      ensureTaskCanTransition(task, 'cancelled')

      const now = new Date().toISOString()
      const updatedTask: InventoryTask = {
        ...task,
        status: 'cancelled',
        completedBy: userId,
        completedAt: now
      }

      const result = await couchDB.updateDocument(task._id, updatedTask, task._rev)
      return { ...updatedTask, _id: result.id, _rev: result.rev }
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to cancel inventory task "${taskId}"`)
    }
  },

  /* Create a planned return task linked to a checkout task. */
  async createLinkedReturnTask(
    checkoutTaskId: string,
    itemId: string,
    userId: string,
    dueAt?: string
  ): Promise<InventoryTask> {
    try {
      const checkoutTask = await getTaskByIdOrThrow(checkoutTaskId)

      return this.createTask(
        {
          actionType: 'return',
          status: 'planned',
          targetId: itemId,
          targetType: checkoutTask.targetType === 'inventoryItem' ? checkoutTask.targetType : 'inventoryItem',
          assignedTo: userId,
          dueAt: dueAt ?? null,
          fromParentId: checkoutTask.toParentId ?? null,
          fromParentType: checkoutTask.toParentType ?? null,
          toParentId: checkoutTask.fromParentId ?? null,
          toParentType: checkoutTask.fromParentType ?? null,
          fromPosition: checkoutTask.toPosition ?? null,
          toPosition: checkoutTask.fromPosition ?? null,
          linkedTaskId: checkoutTask.taskId,
          description: `Return task linked to checkout "${checkoutTask.taskId}"`
        },
        userId
      )
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to create linked return task for "${checkoutTaskId}"`)
    }
  },

  /* Bulk-skip all planned tasks attached to a target entity. */
  async skipTasksForTarget(targetId: string, reason: string): Promise<number> {
    try {
      const tasks = await this.getTasksForTarget(targetId, MAX_TASK_FETCH)
      const now = new Date().toISOString()
      const plannedTasks = tasks
        .filter((task): task is InventoryTask => task.type === 'inventoryTask' && isPendingTask(task))

      if (plannedTasks.length === 0) {
        return 0
      }

      const docsToUpdate = plannedTasks.map((task) => {
        return {
          ...task,
          status: 'skipped' as const,
          completedBy: 'system',
          completedAt: now,
          notes: reason || task.notes
        }
      })

      const result = await couchDB.bulkUpdateDocuments<CloudantV1.Document>(docsToUpdate as unknown as CloudantV1.Document[])
      return result.filter(entry => entry.ok && !entry.error).length
    }
    catch (error: unknown) {
      throw toErrorMessage(error, `Failed to skip tasks for target "${targetId}"`)
    }
  },

  /* Generate planned expiry tasks for items expiring at/before the given cutoff. */
  async createExpiryTasks(beforeDate: string): Promise<InventoryTask[]> {
    try {
      const parsedBeforeDate = new Date(beforeDate)
      if (Number.isNaN(parsedBeforeDate.getTime())) {
        throw new Error(`Invalid beforeDate "${beforeDate}"`)
      }

      const plannedTasks = await listPlannedTasks()
      const existingExpiryTargets = new Set(
        plannedTasks
          .filter(task => task.actionType === 'discard_expired')
          .map(task => task.targetId)
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

      const createdTasks: InventoryTask[] = []
      for (const item of expiringItems) {
        const task = await this.createTask(
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
        createdTasks.push(task)
      }

      return createdTasks
    }
    catch (error: unknown) {
      throw toErrorMessage(error, 'Failed to create expiry inventory tasks')
    }
  }
}
