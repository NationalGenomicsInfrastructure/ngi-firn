import type { InventoryActionType, InventoryFlagType } from '~~/schemas/inventory/metadata'

export interface ActionTypeMeta {
  label: string
  /* Human-readable label for the action when used in progressive tense (e.g., "Check out" for "Checked out"). */
  progressive: string
  icon: string
  /* UnaUI badge variant used to color the action badge. */
  badge: string
}

export interface FlagMeta {
  label: string
  icon: string
  badge: string
}

/*
 * Visual metadata for each audit-log action type. Icons are dynamic (bound from this map),
 * so every i-lucide-* used here must also be present in uno.config.ts `safelist`.
 */
export const ACTION_TYPE_META: Record<InventoryActionType, ActionTypeMeta> = {
  checkout: { label: 'Checked out', progressive: 'Check out', icon: 'i-lucide-package-open', badge: 'solid-indigo' },
  return: { label: 'Returned', progressive: 'Return', icon: 'i-lucide-package-check', badge: 'solid-success' },
  move: { label: 'Moved', progressive: 'Move', icon: 'i-lucide-move', badge: 'solid-primary' },
  mark_expired: { label: 'Marked expired', progressive: 'Mark as expired', icon: 'i-lucide-calendar-x', badge: 'solid-yellow' },
  dispose: { label: 'Disposed', progressive: 'Dispose', icon: 'i-lucide-trash-2', badge: 'solid-error' },
  post_missing: { label: 'Reported missing', progressive: 'Report missing', icon: 'i-lucide-search-x', badge: 'solid-error' },
  reserve: { label: 'Reserved', progressive: 'Reserve', icon: 'i-lucide-bookmark', badge: 'solid-indigo' },
  unreserve: { label: 'Released reservation', progressive: 'Release reservation', icon: 'i-lucide-bookmark-x', badge: 'solid-gray' },
  register: { label: 'Registered', progressive: 'Register', icon: 'i-lucide-circle-plus', badge: 'solid-success' },
  modify: { label: 'Modified', progressive: 'Modify', icon: 'i-lucide-pencil', badge: 'solid-primary' },
  locate: { label: 'Located', progressive: 'Locate', icon: 'i-lucide-map-pin', badge: 'solid-success' },
  flag: { label: 'Flagged', progressive: 'Flag', icon: 'i-lucide-flag', badge: 'solid-yellow' },
  unflag: { label: 'Unflagged', progressive: 'Unflag', icon: 'i-lucide-flag-off', badge: 'solid-gray' },
  note: { label: 'Note', progressive: 'Note', icon: 'i-lucide-message-square', badge: 'solid-gray' }
}

/*
 * Visual metadata for log-entry flags. Icons are dynamic — keep them in the uno.config safelist.
 */
export const FLAG_META: Record<InventoryFlagType, FlagMeta> = {
  success: { label: 'Success', icon: 'i-lucide-circle-check', badge: 'solid-emerald' },
  warning: { label: 'Warning', icon: 'i-lucide-triangle-alert', badge: 'solid-amber' },
  error: { label: 'Error', icon: 'i-lucide-circle-x', badge: 'solid-red' },
  info: { label: 'Info', icon: 'i-lucide-info', badge: 'solid-indigo' }
}

export function getActionTypeMeta(actionType: InventoryActionType): ActionTypeMeta {
  return ACTION_TYPE_META[actionType] ?? { label: actionType, icon: 'i-lucide-activity', badge: 'solid-gray' }
}

export function getFlagMeta(flag: InventoryFlagType): FlagMeta {
  return FLAG_META[flag] ?? { label: flag, icon: 'i-lucide-flag', badge: 'solid-gray' }
}

/* Turn a stored field key (e.g. "projectRefs", "containerType") into a human-readable label. */
export function prettifyFieldName(field: string): string {
  const withSpaces = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!withSpaces) return field
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase()
}

/* Render a change-record before/after value for display in a compact, readable way. */
export function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.trim() === '' ? '—' : value
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}
