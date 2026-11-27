/*
 * Task resource policy — the single source of truth for "who may read / manage a task" and for what
 * a task's state still allows.
 *
 * Access to a task is relationship-based (ReBAC), not a static role: it derives from the task
 * document's own fields (managing owner, responsible colleagues, explicit viewers and public
 * visibility). Centralizing the rules here keeps every task service — and, later, the tRPC/REST
 * procedures — enforcing exactly the same policy, so a direct service call cannot drift from the
 * API layer. The coarse account gate (logged in / admin / token) stays in the tRPC middleware.
 */
import type { FirnUser } from '../../types/auth'
import type {
  DisplayTaskViewerRole,
  TaskActivationDocument,
  TaskAllowedActions,
  TaskDocument
} from '../../types/productivity'
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

/* A completed or cancelled task is closed: its work is over. Archival is a separate axis. */
export function isTaskClosed(task: Pick<TaskDocument, 'status'>): boolean {
  return task.status === 'completed' || task.status === 'cancelled'
}

/* Somebody is already responsible, so the task is not up for grabs. */
export function isTaskClaimed(task: Pick<TaskDocument, 'responsibleUsers'>): boolean {
  return task.responsibleUsers.length > 0
}

/* The managing owner's user id; null for system-owned tasks. */
export function ownerIdOf(task: Pick<TaskDocument, 'managingOwner'>): string | null {
  return task.managingOwner.kind === 'user' ? task.managingOwner.user.id : null
}

// ---------------------------------------------------------------------------------------------
// State rules
//
// Each rule is written once, as the reason for refusing (null when allowed). The assert* guards
// throw it and taskActionsFor reads it, so what a user is offered cannot drift from what is
// accepted.
// ---------------------------------------------------------------------------------------------

type Refusal = string | null

function throwIfRefused(refusal: Refusal): void {
  if (refusal) throw new ForbiddenError(refusal)
}

function claimRefusal(task: TaskDocument, actor: FirnUser): Refusal {
  if (!isActiveAccount(actor)) return 'Only approved, active users can claim tasks.'
  if (task.visibility !== 'public') return 'Only public tasks can be claimed.'
  if (task.status !== 'open' || task.archivedAt) return 'This task is not available to claim.'
  if (isTaskOwner(task, actor)) return 'You already own this task.'
  return null
}

function releaseRefusal(task: TaskDocument, actor: FirnUser): Refusal {
  if (!isTaskResponsible(task, actor)) return 'You are not responsible for this task.'
  if (task.archivedAt || isTaskClosed(task)) {
    return 'Responsibility for a finished or archived task can no longer be released.'
  }
  return null
}

function publishRefusal(task: Pick<TaskDocument, 'status' | 'archivedAt'>): Refusal {
  if (task.archivedAt) return 'An archived task can no longer be published.'
  if (task.status !== 'draft') return `A ${task.status} task cannot be published.`
  return null
}

function cancelRefusal(task: Pick<TaskDocument, 'status' | 'archivedAt'>): Refusal {
  if (task.archivedAt) return 'An archived task can no longer be cancelled.'
  if (isTaskClosed(task)) return `A ${task.status} task cannot be cancelled.`
  return null
}

/* Throw unless the actor may claim the task from the pool (the "already claimed" check is the caller's CAS). */
export function assertCanClaimTask(task: TaskDocument, actor: FirnUser): void {
  throwIfRefused(claimRefusal(task, actor))
}

/* Throw unless the actor is a responsible colleague who may give that responsibility up. */
export function assertCanReleaseResponsibility(task: TaskDocument, actor: FirnUser): void {
  throwIfRefused(releaseRefusal(task, actor))
}

/*
 * State guards of the owner's lifecycle transitions; who may ask is assertCanManageTask's job.
 * Services return early when the task already is in the requested state, so retries stay harmless.
 */

/* Throw unless the task is a draft that can still be published. */
export function assertTaskCanBePublished(task: Pick<TaskDocument, 'status' | 'archivedAt'>): void {
  throwIfRefused(publishRefusal(task))
}

/* Throw unless the task is unfinished and can still be cancelled. */
export function assertTaskCanBeCancelled(task: Pick<TaskDocument, 'status' | 'archivedAt'>): void {
  throwIfRefused(cancelRefusal(task))
}

// ---------------------------------------------------------------------------------------------
// Live work
// ---------------------------------------------------------------------------------------------

/* An activation whose work is neither finished nor cancelled, so its holds are still in place. */
export function isLiveActivation(activation: Pick<TaskActivationDocument, 'state'>): boolean {
  return activation.state === 'active' || activation.state === 'needs_reconciliation'
}

/* Why live work forbids closing the task (cancelling or archiving it); null when there is none. */
export function liveWorkRefusal(activations: Pick<TaskActivationDocument, 'state'>[], verb: string): Refusal {
  if (!activations.some(isLiveActivation)) return null
  return `This task has activated work in progress and cannot be ${verb}. Cancel or finish the activation first.`
}

/* Executors of live work who would be neither owner nor responsible with the given membership. */
export function executorsLosingTheirRight(
  activations: Pick<TaskActivationDocument, 'state' | 'executor'>[],
  nextResponsible: { id: string }[],
  nextOwnerId: string | null
): TaskActivationDocument['executor'][] {
  return activations
    .filter(isLiveActivation)
    .map(activation => activation.executor)
    .filter(executor => executor.id !== nextOwnerId && !nextResponsible.some(r => r.id === executor.id))
}

// ---------------------------------------------------------------------------------------------
// Allowed actions
// ---------------------------------------------------------------------------------------------

/*
 * The actions to offer the actor on this task. An action is absent when the actor or the task's
 * state rules it out, and carries a `blockedReason` when only live work stands in its way. Pass the
 * task's activations.
 */
export function taskActionsFor(
  task: TaskDocument,
  actor: FirnUser,
  activations: Pick<TaskActivationDocument, 'state' | 'executor'>[]
): TaskAllowedActions {
  if (!canReadTask(task, actor)) return {}

  const actions: TaskAllowedActions = {}
  const ready = { blockedReason: null }

  if (claimRefusal(task, actor) === null && !isTaskClaimed(task)) actions.claim = ready

  if (releaseRefusal(task, actor) === null) {
    const remaining = task.responsibleUsers.filter(r => r.id !== actor._id)
    const stranded = executorsLosingTheirRight(activations, remaining, ownerIdOf(task))
    actions.releaseResponsibility = {
      blockedReason: stranded.length
        ? 'Activated work is still being executed. Hand the activation over or cancel it first.'
        : null
    }
  }

  if (isTaskOwner(task, actor)) {
    actions.setSharing = ready
    if (publishRefusal(task) === null) actions.publish = ready
    const closing = { blockedReason: liveWorkRefusal(activations, 'cancelled or archived') }
    if (cancelRefusal(task) === null) actions.cancel = closing
    if (!task.archivedAt) actions.archive = closing
  }

  return actions
}
