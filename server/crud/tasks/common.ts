/*
 * Shared helpers for the task domain services (server/crud/tasks).
 *
 * Centralizes concerns reused by the task and step services: CouchDB write-conflict
 * detection, user reference resolution and validation, access-control role resolution,
 * priority (urgency/quadrant) computation in the Europe/Stockholm timezone, and client-safe
 * display projections. ACL checks live here (and are called from the services) so direct
 * service calls cannot bypass them.
 */
import { DateTime } from 'luxon'

import { couchDB } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { TypedDocumentReference } from '../../../types/references'
import type { SerializedUserRef } from '../../../types/inventory'
import type {
  DisplayTaskActor,
  DisplayTaskViewerRole,
  TaskActor,
  TaskDocument,
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

/* Error thrown when the requesting user may not read a task. */
export class TaskAccessError extends Error {
  constructor(message = 'You do not have access to this task.') {
    super(message)
    this.name = 'TaskAccessError'
  }
}

/* Error thrown when the requesting user may read but not perform the requested action. */
export class TaskForbiddenError extends Error {
  constructor(message = 'You are not allowed to perform this action on this task.') {
    super(message)
    this.name = 'TaskForbiddenError'
  }
}

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

/* Build a stored user reference from a resolved FirnUser. */
export function toUserRef(user: FirnUser): TypedDocumentReference<FirnUser> {
  return { db: 'firn', id: user._id, type: 'firnUser' }
}

/* Build a system TaskActor for automated (e.g. cleanup) tasks. */
export function systemActor(source: string): TaskActor {
  return { kind: 'system', source }
}

/* Build a user TaskActor from a resolved FirnUser. */
export function userActor(user: FirnUser): TaskActor {
  return { kind: 'user', user: toUserRef(user) }
}

/* A FirnUser may participate in tasks only when active and approved. */
export function isActiveApprovedUser(user: FirnUser): boolean {
  return user.allowLogin === true && user.isRetired !== true
}

/* Map a resolved FirnUser to its client-safe display stub (never exposes the _id). */
export function toSerializedUserRef(user: FirnUser): SerializedUserRef {
  const name = user.googleName?.trim()
    || [user.googleGivenName, user.googleFamilyName].filter(Boolean).join(' ').trim()
    || user.githubName?.trim()
    || user.firnId
  return { firnId: user.firnId, name, avatar: user.googleAvatar ?? user.githubAvatar ?? null }
}

const UNKNOWN_USER_REF: SerializedUserRef = { firnId: '', name: 'Unknown user', avatar: null }

/*
 * Resolve a set of firnIds to active, approved FirnUser documents. Unknown or inactive users are
 * reported so sharing never silently drops a colleague. Returns users in input order, deduplicated.
 */
export async function resolveUsersByFirnIds(firnIds: string[]): Promise<FirnUser[]> {
  const distinct = [...new Set(firnIds.filter(id => typeof id === 'string' && id.length > 0))]
  if (distinct.length === 0) return []

  const rows = (await couchDB.queryView<string, null, FirnUser>('firn-users', 'by_firnId', {
    keys: distinct,
    include_docs: true
  })).rows

  const byFirnId = new Map<string, FirnUser>()
  for (const row of rows) {
    const doc = row.doc
    if (doc && doc.type === 'firnUser' && doc.firnId) byFirnId.set(doc.firnId, doc)
  }

  const resolved: FirnUser[] = []
  const missing: string[] = []
  const inactive: string[] = []
  for (const firnId of distinct) {
    const user = byFirnId.get(firnId)
    if (!user) {
      missing.push(firnId)
      continue
    }
    if (!isActiveApprovedUser(user)) {
      inactive.push(firnId)
      continue
    }
    resolved.push(user)
  }

  if (missing.length > 0) throw new TaskValidationError(`Unknown user(s): ${missing.join(', ')}`)
  if (inactive.length > 0) throw new TaskValidationError(`Inactive or unapproved user(s): ${inactive.join(', ')}`)
  return resolved
}

/* Batch-resolve stored user references into client-safe display stubs. */
export async function resolveUserRefs(
  refs: TypedDocumentReference<FirnUser>[]
): Promise<SerializedUserRef[]> {
  const ids = [...new Set(refs.map(r => r.id).filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return []
  const docs = await couchDB.getDocumentsByIds<FirnUser>(ids)
  const map = new Map<string, SerializedUserRef>()
  for (const doc of docs) {
    if (doc && doc.type === 'firnUser') map.set(doc._id, toSerializedUserRef(doc))
  }
  return refs.map(r => (r.id ? map.get(r.id) : undefined) ?? UNKNOWN_USER_REF)
}

/* Project a stored TaskActor into a client-safe actor (resolving a user ref when present). */
export async function toDisplayActor(actor: TaskActor): Promise<DisplayTaskActor> {
  if (actor.kind === 'system') return { kind: 'system', source: actor.source }
  const [ref] = await resolveUserRefs([actor.user])
  return { kind: 'user', user: ref ?? UNKNOWN_USER_REF }
}

// ---------------------------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------------------------

/* True when the actor is the task's managing owner (system-owned tasks have no user owner). */
export function isOwner(task: TaskDocument, actor: FirnUser): boolean {
  return task.managingOwner.kind === 'user' && task.managingOwner.user.id === actor._id
}

/* True when the actor is a responsible colleague. */
export function isResponsible(task: TaskDocument, actor: FirnUser): boolean {
  return task.responsibleUsers.some(r => r.id === actor._id)
}

/* True when the actor is an explicit viewer. */
export function isViewer(task: TaskDocument, actor: FirnUser): boolean {
  return task.viewers.some(v => v.id === actor._id)
}

/* The actor's role relative to a task, highest privilege first; null when no read access. */
export function resolveViewerRole(task: TaskDocument, actor: FirnUser): DisplayTaskViewerRole | null {
  if (isOwner(task, actor)) return 'owner'
  if (isResponsible(task, actor)) return 'responsible'
  if (isViewer(task, actor)) return 'viewer'
  if (task.visibility === 'public') return 'public'
  return null
}

/* True when the actor may read the task at all. */
export function canRead(task: TaskDocument, actor: FirnUser): boolean {
  return resolveViewerRole(task, actor) !== null
}

/* Throw unless the actor may read the task. */
export function assertCanRead(task: TaskDocument, actor: FirnUser): void {
  if (!canRead(task, actor)) throw new TaskAccessError()
}

/* Throw unless the actor is the managing owner (sharing/visibility/structural edits). */
export function assertCanManage(task: TaskDocument, actor: FirnUser): void {
  assertCanRead(task, actor)
  if (!isOwner(task, actor)) throw new TaskForbiddenError('Only the task owner can manage this task.')
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
