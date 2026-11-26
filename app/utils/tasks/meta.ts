import type { DisplayTaskViewerRole, TaskStatus, TaskStepState } from '~~/schemas/tasks/enums'

/*
 * Visual metadata of task and step lifecycle states. Icons and badge variants are bound
 * dynamically, so every i-lucide-* and `badge~="solid-<color>"` used here must also be in
 * uno.config.ts `safelist`. Plain utility classes belong in the .vue files, which UnoCSS scans.
 */
export interface TaskStateMeta {
  label: string
  icon: string
  badge: string
}

export const TASK_STATUS_META: Record<TaskStatus, TaskStateMeta> = {
  draft: { label: 'Draft', icon: 'i-lucide-pencil', badge: 'solid-gray' },
  open: { label: 'Open', icon: 'i-lucide-circle-dot', badge: 'solid-primary' },
  completed: { label: 'Completed', icon: 'i-lucide-circle-check', badge: 'solid-success' },
  cancelled: { label: 'Cancelled', icon: 'i-lucide-ban', badge: 'solid-gray' }
}

/* The key order is the order of the checklist legend: resolved, then in flight, then open. */
export const TASK_STEP_STATE_META: Record<TaskStepState, TaskStateMeta> = {
  completed: { label: 'Completed', icon: 'i-lucide-circle-check', badge: 'solid-success' },
  skipped: { label: 'Skipped', icon: 'i-lucide-skip-forward', badge: 'solid-yellow' },
  executing: { label: 'Executing', icon: 'i-lucide-loader', badge: 'solid-primary' },
  needs_reconciliation: { label: 'Needs reconciliation', icon: 'i-lucide-triangle-alert', badge: 'solid-error' },
  held: { label: 'Held', icon: 'i-lucide-lock', badge: 'solid-indigo' },
  planned: { label: 'Planned', icon: 'i-lucide-circle-dashed', badge: 'solid-gray' },
  cancelled: { label: 'Cancelled', icon: 'i-lucide-ban', badge: 'solid-gray' }
}

export const TASK_VIEWER_ROLE_LABELS: Record<DisplayTaskViewerRole, string> = {
  owner: 'Managing owner',
  responsible: 'Responsible',
  viewer: 'Viewer',
  public: 'Not a member (public task)'
}
