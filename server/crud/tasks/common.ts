/*
 * Shared helpers for the task domain services (server/crud/tasks).
 *
 * Holds task-domain glue reused by the task and step services: task-actor builders, firnId
 * resolution with task-appropriate validation errors, priority (urgency/quadrant) computation in
 * the Europe/Stockholm timezone and progress aggregation.
 *
 * User-reference resolution lives in UserService (server/crud/users.server.ts); task access
 * control (who may read/manage) lives in the resource policy at server/auth/taskPolicy.ts. This
 * module re-exposes neither — services import those directly, so there is one home for each.
 */
import { DateTime } from 'luxon'

import { TASK_MAX_PAGE_SIZE, TASK_PAGE_SIZE } from '../../../schemas/tasks/common'

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
import type { TypedDocumentReference } from '../../../types/references'

/* Timezone used for all due-date/urgency boundary math. */
export const TASK_TIMEZONE = 'Europe/Stockholm'

/* Bounded page size for task/step listings (defined with the listing schema it bounds). */
export { TASK_MAX_PAGE_SIZE, TASK_PAGE_SIZE }

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

/*
 * The membership rules of a task, applied wherever members are set: the managing owner is never
 * also listed, nobody is listed twice, and responsibility wins over viewing.
 */
export function normalizeMembers(
  ownerId: string | null,
  responsibleUsers: TypedDocumentReference<FirnUser>[],
  viewers: TypedDocumentReference<FirnUser>[]
) {
  const listed = new Set(ownerId ? [ownerId] : [])
  const listOnce = (ref: TypedDocumentReference<FirnUser>) => {
    if (listed.has(ref.id)) return false
    listed.add(ref.id)
    return true
  }
  // Order matters: whoever is listed as responsible is skipped among the viewers.
  return { responsibleUsers: responsibleUsers.filter(listOnce), viewers: viewers.filter(listOnce) }
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

/* A task is urgent when its due date is overdue or at most this many working days away. */
export const TASK_URGENCY_HORIZON_WORKDAYS = 3

/* An important task becomes urgent after this many days untouched without a due date, so it is not overlooked. */
export const TASK_AGING_DAYS = 14

export type TaskUrgencyReason = 'deadline' | 'aged' | null

/* Add working days (Monday to Friday) to a day; weekends are skipped. */
function addWorkingDays(day: DateTime, count: number): DateTime {
  let result = day
  for (let added = 0; added < count;) {
    result = result.plus({ days: 1 })
    if (result.weekday <= 5) added++
  }
  return result
}

/*
 * Urgency is time pressure, computed on read and never stored:
 *  - `deadline`: the due date is overdue or within the working-day horizon;
 *  - `aged`: an important task without a due date has not been updated for TASK_AGING_DAYS.
 * Everything else, including far-off deadlines and ordinary undated tasks, is not urgent.
 */
export function computeUrgency(
  task: { dueDate: string | null, importance: TaskImportance, updatedAt: string },
  now: DateTime = DateTime.now()
): { urgency: TaskUrgency, reason: TaskUrgencyReason } {
  const today = now.setZone(TASK_TIMEZONE).startOf('day')
  if (task.dueDate) {
    const due = DateTime.fromISO(task.dueDate, { zone: TASK_TIMEZONE })
    if (due.isValid && due.startOf('day') <= addWorkingDays(today, TASK_URGENCY_HORIZON_WORKDAYS)) {
      return { urgency: 'urgent', reason: 'deadline' }
    }
    return { urgency: 'not_urgent', reason: null }
  }
  if (task.importance === 'important') {
    const touched = DateTime.fromISO(task.updatedAt, { zone: TASK_TIMEZONE })
    if (touched.isValid && today.diff(touched.startOf('day'), 'days').days >= TASK_AGING_DAYS) {
      return { urgency: 'urgent', reason: 'aged' }
    }
  }
  return { urgency: 'not_urgent', reason: null }
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
