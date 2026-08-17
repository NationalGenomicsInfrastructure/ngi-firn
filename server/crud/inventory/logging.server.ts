/*
 * Logging Service - Table of Contents
 * ************************************
 *
 * CHANGE RECORD HELPERS:
 * createInventoryChangeRecords(trackedFields) - Diff tracked before/after field pairs into change records
 * createModifyActionLogEntry(params) - Build a "modify" log entry from tracked field changes
 *
 * ACTION LOG HELPERS:
 * statusFromAction(action) - Determine the resulting inventory status after a given action type
 * buildAlterActionNotes(target, action, name, logComment, flagKind) - Generate a default log message when no comment is provided
 *
 * CONTAINER LOGGING:
 * createChangelogEntry(existing, next, firnUser, manualComment?) - Create a "modify" log entry by diffing two container snapshots
 */

import type { FirnUser } from '../../../types/auth'
import type {
  Container,
  InventoryActionChangeRecord,
  InventoryActionLogEntry,
  InventoryTrackedField
} from '../../../types/inventory'
import type {
  InventoryActionType,
  InventoryFlagType,
  InventoryStatusType
} from '~~/schemas/inventory/metadata'
import { toUserRef } from './relations.server'

/*
 * Basic functions for creating inventory action log entries and change records.
 */

// Utility function to perform stable serialization of objects for comparison
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }

  const objectValue = value as Record<string, unknown>
  const sortedKeys = Object.keys(objectValue).sort()
  return `{${sortedKeys.map(key => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`).join(',')}}`
}

// Compares two values and returns true if they are different, false if they are the same
function hasChanged(before: unknown, after: unknown): boolean {
  return stableSerialize(before) !== stableSerialize(after)
}

// Creates an array of InventoryActionChangeRecord objects for fields that have changed
export function createInventoryChangeRecords(trackedFields: InventoryTrackedField[]): InventoryActionChangeRecord[] {
  const changes: InventoryActionChangeRecord[] = []

  for (const entry of trackedFields) {
    if (hasChanged(entry.before, entry.after)) {
      changes.push({
        field: entry.field,
        before: entry.before,
        after: entry.after
      })
    }
  }

  return changes
}

/*
 * Helper functions to log inventory actions on containers and items and determine status changes based on action types.
 */

// Creates an InventoryActionLogEntry for a "modify" action, including the changes made to tracked fields
export function createModifyActionLogEntry(params: {
  firnUser: FirnUser
  trackedFields: InventoryTrackedField[]
  notes: string
  timestamp: string
}): InventoryActionLogEntry | null {
  const changes = createInventoryChangeRecords(params.trackedFields)
  if (changes.length === 0) {
    return null
  }

  return {
    actionType: 'modify',
    firnUser: toUserRef(params.firnUser),
    timestamp: params.timestamp,
    notes: params.notes,
    changes: changes
  }
}

// Determines the resulting inventory status of an item or container based on the action type performed
export function statusFromAction(action: InventoryActionType): InventoryStatusType | null {
  switch (action) {
    case 'checkout':
      return 'in_use'
    case 'register':
      return 'available'
    case 'return':
      return 'available'
    case 'reserve':
      return 'reserved'
    case 'unreserve':
      return 'available'
    case 'dispose':
      return 'disposed'
    case 'post_missing':
      return 'lost'
    case 'mark_expired':
      return 'expired'
    case 'locate':
      return 'available'
    case 'flag':
    case 'unflag':
    case 'modify':
    case 'move':
    case 'note':
      return null
    default:
      return null
  }
}

// If no log comment is provided, this function generates a default log message based on the action type and target (container or inventory item)
export function buildAlterActionNotes(
  target: 'container' | 'inventory_item',
  action: InventoryActionType,
  name: string,
  logComment: string | null | undefined,
  flagKind: InventoryFlagType | null | undefined
): string {
  if (logComment?.trim()) {
    return logComment
  }

  const targetString = target === 'container' ? 'container' : 'inventory item'

  switch (action) {
    case 'checkout':
      return `Checked out ${targetString} "${name}".`
    case 'return':
      return `Returned ${targetString} "${name}" to available status.`
    case 'reserve':
      return `Reserved ${targetString} "${name}".`
    case 'unreserve':
      return `Released reservation for ${targetString} "${name}".`
    case 'dispose':
      return `Disposed ${targetString} "${name}".`
    case 'post_missing':
      return `Marked ${targetString} "${name}" as missing.`
    case 'mark_expired':
      return `Marked ${targetString} "${name}" as expired.`
    case 'locate':
      return `Located ${targetString} "${name}" and returned it to storage.`
    case 'note':
      return `Added note to ${targetString} "${name}".`
    case 'flag':
      return `Added "${flagKind}" flag to ${targetString} "${name}".`
    case 'unflag':
      return `Removed "${flagKind}" flag from ${targetString} "${name}".`
    default:
      return `Performed action "${action}" on ${targetString} "${name}".`
  }
}

/*
 * Container logging functions
 */

export function createChangelogEntry(
  existing: Container,
  next: Container,
  firnUser: FirnUser,
  manualComment?: string
): InventoryActionLogEntry | null {
  const trackedFields: InventoryTrackedField[] = [
    { field: 'containerType', before: existing.containerType, after: next.containerType },
    { field: 'classification', before: existing.classification, after: next.classification },
    { field: 'name', before: existing.name, after: next.name },
    { field: 'slug', before: existing.slug, after: next.slug },
    { field: 'label', before: existing.label, after: next.label },
    { field: 'description', before: existing.description, after: next.description },
    { field: 'projectRefs', before: existing.projectRefs, after: next.projectRefs },
    { field: 'capacity', before: existing.capacity, after: next.capacity }
  ]

  return createModifyActionLogEntry({
    firnUser,
    trackedFields,
    timestamp: next.updatedAt,
    notes: manualComment ?? `modified container "${next.name}".`
  })
}
