/*
 * Shared helpers for the task domain services (server/crud/tasks).
 *
 * Holds task-domain glue reused by the task and step services: CouchDB write-conflict detection,
 * task-actor builders, firnId resolution with task-appropriate validation errors, priority
 * (urgency/quadrant) computation in the Europe/Stockholm timezone and progress aggregation.
 *
 * User-reference resolution lives in UserService (server/crud/users.server.ts); task access
 * control (who may read/manage) lives in the resource policy at server/auth/taskPolicy.ts. This
 * module re-exposes neither — services import those directly, so there is one home for each.
 */
import { DateTime } from 'luxon'

import {
  resolveUserRefs,
  resolveUsersByFirnIds as resolveUsersByFirnIdsRaw,
  toUserRef,
  UNKNOWN_USER_REF
} from '../users.server'
import type { FirnUser } from '../../../types/auth'
import type {
  DisplayTaskActor,
  TaskActor,
  TaskImportance,
  TaskProgressSummary,
  TaskQuadrant,
  TaskStepDocument,
  TaskStepState,
  TaskUrgency
} from '../../../types/productivity'

/* Timezone used for all due-date/urgency boundary math. */
export const TASK_TIMEZONE = 'Europe/Stockholm'

/* Bounded page size for task/step listings. */
export const TASK_PAGE_SIZE = 50
export const TASK_MAX_PAGE_SIZE = 200

/* Error thrown when a task/step cannot be found. */
export class TaskNotFoundError extends Error {
  constructor(message = 'Task not found.') {
    super(message)
    this.name = 'TaskNotFoundError'
  }
}

/* Error thrown on a validation failure (bad definition, dependency cycle, stale version, ...). */
export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaskValidationError'
  }
}

/* Error thrown when an optimistic concurrency guard (claim, edit version) is lost. */
export class TaskConflictError extends Error {
  constructor(message = 'The task was modified concurrently; please retry.') {
    super(message)
    this.name = 'TaskConflictError'
  }
}

/* True when an error is a CouchDB document update conflict (HTTP 409). */
export function isCouchConflict(error: unknown): boolean {
  const err = error as { code?: number, status?: number, statusCode?: number }
  return err?.code === 409 || err?.status === 409 || err?.statusCode === 409
}

/* Build a system TaskActor for automated (e.g. cleanup) tasks. */
export function systemActor(source: string): TaskActor {
  return { kind: 'system', source }
}

/* Build a user TaskActor from a resolved FirnUser. */
export function userActor(user: FirnUser): TaskActor {
  return { kind: 'user', user: toUserRef(user) }
}

/*
 * Resolve a set of firnIds to active, approved FirnUser documents, raising a task-domain validation
 * error when any are unknown or inactive so sharing never silently drops a colleague. The lookup and
 * active/approved filtering live in UserService; this wrapper only maps its result to the error type
 * the task services expect. Returns users in input order, deduplicated.
 */
export async function resolveUsersByFirnIds(firnIds: string[]): Promise<FirnUser[]> {
  const { users, missing, inactive } = await resolveUsersByFirnIdsRaw(firnIds)
  if (missing.length > 0) throw new TaskValidationError(`Unknown user(s): ${missing.join(', ')}`)
  if (inactive.length > 0) throw new TaskValidationError(`Inactive or unapproved user(s): ${inactive.join(', ')}`)
  return users
}

/* Project a stored TaskActor into a client-safe actor (resolving a user ref when present). */
export async function toDisplayActor(actor: TaskActor): Promise<DisplayTaskActor> {
  if (actor.kind === 'system') return { kind: 'system', source: actor.source }
  const [ref] = await resolveUserRefs([actor.user])
  return { kind: 'user', user: ref ?? UNKNOWN_USER_REF }
}

// ---------------------------------------------------------------------------------------------
// Priority (importance x urgency)
// ---------------------------------------------------------------------------------------------

/* A task is urgent when it has a due date that falls on or before today in Europe/Stockholm. */
export function computeUrgency(dueDate: string | null, now: DateTime = DateTime.now()): TaskUrgency {
  if (!dueDate) return 'not_urgent'
  const due = DateTime.fromISO(dueDate, { zone: TASK_TIMEZONE })
  if (!due.isValid) return 'not_urgent'
  const today = now.setZone(TASK_TIMEZONE).startOf('day')
  return due.startOf('day') <= today ? 'urgent' : 'not_urgent'
}

/* Derive the priority quadrant from importance and computed urgency. */
export function computeQuadrant(importance: TaskImportance, urgency: TaskUrgency): TaskQuadrant {
  if (importance === 'important') return urgency === 'urgent' ? 'important_urgent' : 'important_not_urgent'
  return urgency === 'urgent' ? 'ordinary_urgent' : 'ordinary_not_urgent'
}

// ---------------------------------------------------------------------------------------------
// Progress summary
// ---------------------------------------------------------------------------------------------

/* Aggregate step states into a derived (non-authoritative) progress summary. */
export function summarizeProgress(steps: Pick<TaskStepDocument, 'state'>[]): TaskProgressSummary {
  const summary: TaskProgressSummary = {
    total: steps.length,
    planned: 0,
    held: 0,
    executing: 0,
    completed: 0,
    skipped: 0,
    cancelled: 0,
    needsReconciliation: 0
  }
  const bucket: Record<TaskStepState, keyof TaskProgressSummary> = {
    planned: 'planned',
    held: 'held',
    executing: 'executing',
    completed: 'completed',
    skipped: 'skipped',
    cancelled: 'cancelled',
    needs_reconciliation: 'needsReconciliation'
  }
  for (const step of steps) summary[bucket[step.state]]++
  return summary
}

/* Clamp a requested page size to the bounded range. */
export function clampPageSize(requested?: number): number {
  if (!requested || requested <= 0) return TASK_PAGE_SIZE
  return Math.min(requested, TASK_MAX_PAGE_SIZE)
}
