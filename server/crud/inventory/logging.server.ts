import type { FirnUser } from '../../../types/auth'
import type {
  InventoryActionChangeRecord,
  InventoryActionLogEntry
} from '../../../types/inventory'
import { toUserRef } from './relations.server'

export interface InventoryTrackedField {
  field: string
  before: unknown
  after: unknown
}

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

function hasChanged(before: unknown, after: unknown): boolean {
  return stableSerialize(before) !== stableSerialize(after)
}

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
