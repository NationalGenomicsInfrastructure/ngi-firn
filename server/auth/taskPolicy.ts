/*
 * Task resource policy — the single source of truth for "who may read / manage a task".
 *
 * Access to a task is relationship-based (ReBAC), not a static role: it derives from the task
 * document's own fields (managing owner, responsible colleagues, explicit viewers and public
 * visibility). Centralizing the rules here keeps every task service — and, later, the tRPC/REST
 * procedures — enforcing exactly the same policy, so a direct service call cannot drift from the
 * API layer. The coarse account gate (logged in / admin / token) stays in the tRPC middleware.
 */
import type { FirnUser } from '../../types/auth'
import type { DisplayTaskViewerRole, TaskDocument } from '../../types/productivity'
import { AuthorizationError, ForbiddenError } from './errors'

/* True when the actor is the task's managing owner (system-owned tasks have no user owner). */
export function isTaskOwner(task: TaskDocument, actor: FirnUser): boolean {
  return task.managingOwner.kind === 'user' && task.managingOwner.user.id === actor._id
}

/* True when the actor is a responsible colleague. */
export function isTaskResponsible(task: TaskDocument, actor: FirnUser): boolean {
  return task.responsibleUsers.some(r => r.id === actor._id)
}

/* True when the actor is an explicit viewer. */
export function isTaskViewer(task: TaskDocument, actor: FirnUser): boolean {
  return task.viewers.some(v => v.id === actor._id)
}

/* The actor's role relative to a task, highest privilege first; null when there is no read access. */
export function resolveTaskRole(task: TaskDocument, actor: FirnUser): DisplayTaskViewerRole | null {
  if (isTaskOwner(task, actor)) return 'owner'
  if (isTaskResponsible(task, actor)) return 'responsible'
  if (isTaskViewer(task, actor)) return 'viewer'
  if (task.visibility === 'public') return 'public'
  return null
}

/* True when the actor may read the task at all. */
export function canReadTask(task: TaskDocument, actor: FirnUser): boolean {
  return resolveTaskRole(task, actor) !== null
}

/* Throw unless the actor may read the task. */
export function assertCanReadTask(task: TaskDocument, actor: FirnUser): void {
  if (!canReadTask(task, actor)) throw new AuthorizationError('You do not have access to this task.')
}

/* Throw unless the actor is the managing owner (sharing, visibility and structural edits). */
export function assertCanManageTask(task: TaskDocument, actor: FirnUser): void {
  assertCanReadTask(task, actor)
  if (!isTaskOwner(task, actor)) throw new ForbiddenError('Only the task owner can manage this task.')
}
