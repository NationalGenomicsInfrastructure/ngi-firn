import type { DisplayTask } from '~~/types/productivity'

/*
 * Which actions on a task to offer the current user. The server decides what is allowed
 * (server/auth/taskPolicy.ts and TaskService); this only mirrors those rules to hide or disable
 * buttons. Never restrict something here that the server would accept: add the rule there first.
 */
export interface TaskActions {
  editPeople: boolean
  publish: boolean
  claim: boolean
  release: boolean
  cancel: boolean
  archive: boolean
  /* The server refuses to cancel or archive a task while work is activated on it. */
  closingBlocked: boolean
}

type TaskActionInput = Pick<
  DisplayTask,
  'viewerRole' | 'status' | 'visibility' | 'responsibleUsers' | 'archivedAt' | 'progress'
>

export function taskActions(task: TaskActionInput): TaskActions {
  const isOwner = task.viewerRole === 'owner'
  const isUnfinished = task.status === 'draft' || task.status === 'open'
  const isArchived = task.archivedAt !== null
  // Steps in these states belong to a live activation.
  const { held, executing, needsReconciliation } = task.progress

  return {
    editPeople: isOwner,
    publish: isOwner && !isArchived && task.status === 'draft',
    claim: (task.viewerRole === 'public' || task.viewerRole === 'viewer')
      && !isArchived
      && task.status === 'open'
      && task.visibility === 'public'
      && task.responsibleUsers.length === 0,
    release: task.viewerRole === 'responsible' && !isArchived && isUnfinished,
    cancel: isOwner && !isArchived && isUnfinished,
    archive: isOwner && !isArchived,
    closingBlocked: held + executing + needsReconciliation > 0
  }
}

export function hasTaskActions({ closingBlocked: _blocked, ...offered }: TaskActions): boolean {
  return Object.values(offered).some(Boolean)
}
