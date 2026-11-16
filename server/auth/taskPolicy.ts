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
import type { DisplayTaskViewerRole, TaskActivationDocument, TaskDocument } from '../../types/productivity'
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

/*
 * True when the account may take part in shared features: login allowed and not retired. Mirrors
 * isActiveApprovedUser in server/crud/users.server.ts, which this module cannot import because it
 * must stay free of database access. Keep the two in step.
 */
export function isActiveAccount(user: FirnUser): boolean {
  return user.allowLogin === true && user.isRetired !== true
}

/* True when the actor may read the task at all: an active, approved account with a role on it. */
export function canReadTask(task: TaskDocument, actor: FirnUser): boolean {
  return isActiveAccount(actor) && resolveTaskRole(task, actor) !== null
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

/* True when the actor may activate and execute a task's work (managing owner or responsible). */
export function canExecuteTask(task: TaskDocument, actor: FirnUser): boolean {
  return isTaskOwner(task, actor) || isTaskResponsible(task, actor)
}

/*
 * Throw unless the actor may activate/execute the task's work. Viewers and public readers cannot;
 * only the managing owner or a responsible colleague may acquire holds and confirm steps. The
 * activation separately binds a single executor, so being eligible here is not a bypass of that.
 */
export function assertCanExecuteTask(task: TaskDocument, actor: FirnUser): void {
  assertCanReadTask(task, actor)
  if (!canExecuteTask(task, actor)) {
    throw new ForbiddenError('Only the task owner or a responsible colleague can carry out this task.')
  }
}

/* True when the user is the executor bound to the activation. */
export function isActivationExecutor(activation: Pick<TaskActivationDocument, 'executor'>, actor: FirnUser): boolean {
  return activation.executor.id === actor._id
}

/* Throw unless the actor is the executor bound to the activation. */
export function assertIsActivationExecutor(
  activation: Pick<TaskActivationDocument, 'executor'>,
  actor: FirnUser,
  message = 'Only the colleague who activated this work may execute its steps.'
): void {
  if (!isActivationExecutor(activation, actor)) throw new ForbiddenError(message)
}

/* Throw unless the actor is the activation's executor or the task's managing owner. */
export function assertCanRecoverActivation(
  task: TaskDocument,
  activation: Pick<TaskActivationDocument, 'executor'>,
  actor: FirnUser
): void {
  if (!isActivationExecutor(activation, actor) && !isTaskOwner(task, actor)) {
    throw new ForbiddenError('Only the executor or the task owner can perform this action.')
  }
}

/* True when the user may be (or stay) the executor of the task's work: active and owner or responsible. */
export function canBeExecutor(task: TaskDocument, user: FirnUser): boolean {
  return isActiveAccount(user) && canExecuteTask(task, user)
}

/* Throw unless the actor may claim the task from the pool (the "already claimed" check is the caller's CAS). */
export function assertCanClaimTask(task: TaskDocument, actor: FirnUser): void {
  if (!isActiveAccount(actor)) throw new ForbiddenError('Only approved, active users can claim tasks.')
  if (task.visibility !== 'public') throw new ForbiddenError('Only public tasks can be claimed.')
  if (task.status !== 'open' || task.archivedAt) throw new ForbiddenError('This task is not available to claim.')
  if (isTaskOwner(task, actor)) throw new ForbiddenError('You already own this task.')
}

/* Throw unless the actor is a responsible colleague who may give that responsibility up. */
export function assertCanReleaseResponsibility(task: TaskDocument, actor: FirnUser): void {
  if (!isTaskResponsible(task, actor)) throw new ForbiddenError('You are not responsible for this task.')
}
