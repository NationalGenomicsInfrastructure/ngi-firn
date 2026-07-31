import type { InventoryClassificationType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import type {
  ContainerCapacity,
  ContainerCapacityEntry,
  ContainerChildKindType,
  ContainerClassification,
  ContainerType
} from '~~/schemas/inventory/container'
import type { ItemType } from '~~/schemas/inventory/items'
import type { SelectOption } from './equipment'

// A container's capacity entry references either a container or an item vocabulary.
export type ChildCategory = ContainerType | ItemType

export interface StatusMeta {
  label: string
  icon: string
  badge: string
}

// Visual metadata per container/item lifecycle status. Icons are dynamic (bound from this map),
// so every i-lucide-* here must also live in uno.config.ts `safelist`.
export const CONTAINER_STATUS_META: Record<InventoryStatusType, StatusMeta> = {
  available: { label: 'Available', icon: 'i-lucide-circle-check', badge: 'solid-success' },
  in_use: { label: 'In use', icon: 'i-lucide-play', badge: 'solid-primary' },
  reserved: { label: 'Reserved', icon: 'i-lucide-bookmark', badge: 'solid-indigo' },
  expired: { label: 'Expired', icon: 'i-lucide-calendar-x', badge: 'solid-yellow' },
  disposed: { label: 'Disposed', icon: 'i-lucide-trash-2', badge: 'solid-gray' },
  lost: { label: 'Lost', icon: 'i-lucide-search-x', badge: 'solid-error' }
}

export function getContainerStatusMeta(status: InventoryStatusType): StatusMeta {
  return CONTAINER_STATUS_META[status] ?? { label: status, icon: 'i-lucide-circle-help', badge: 'solid-gray' }
}

// Badge variant per purpose/domain classification (labels are already human-readable enum values).
export const CONTAINER_CLASSIFICATION_BADGE: Record<InventoryClassificationType, string> = {
  Sample: 'soft-primary',
  Reagent: 'soft-success',
  Control: 'soft-indigo',
  Library: 'soft-yellow',
  Consumable: 'soft-gray',
  Equipment: 'soft-error',
  Other: 'soft-gray'
}

export function getClassificationBadge(classification: InventoryClassificationType): string {
  return CONTAINER_CLASSIFICATION_BADGE[classification] ?? 'soft-gray'
}

export interface CapacitySummary {
  stored: number
  total: number
}

/*
 * Aggregate a container's capacity into a single occupied / total-slots pair.
 * For 'count' entries the total is the numeric cap; for 'grid' entries it is
 * rows * columns * levels. Returns null when no capacity is configured.
 */
export function summarizeCapacity(capacity: ContainerCapacityEntry[] | null): CapacitySummary | null {
  if (!capacity || capacity.length === 0) return null

  let stored = 0
  let total = 0
  for (const entry of capacity) {
    stored += entry.stored
    total += entry.layout === 'grid'
      ? entry.rows * entry.columns * entry.levels
      : entry.capacity
  }
  return { stored, total }
}

// ---------------------------------------------------------------------------
// Container-add form helpers: select options + capacity-editor mode logic
// ---------------------------------------------------------------------------

// Purpose/domain classification options for the create form (labels are the enum values).
export const CONTAINER_CLASSIFICATION_OPTIONS: SelectOption<ContainerClassification>[] = [
  { value: 'Sample', label: 'Sample' },
  { value: 'Reagent', label: 'Reagent' },
  { value: 'Control', label: 'Control' },
  { value: 'Library', label: 'Library' },
  { value: 'Consumable', label: 'Consumable' },
  { value: 'Equipment', label: 'Equipment' },
  { value: 'Other', label: 'Other' }
]

const CLASSIFICATION_VALUES = new Set<string>(CONTAINER_CLASSIFICATION_OPTIONS.map(o => o.value))

export function resolveClassificationFromSelect(value: unknown): ContainerClassification | null {
  if (typeof value === 'string' && CLASSIFICATION_VALUES.has(value)) {
    return value as ContainerClassification
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (typeof inner === 'string' && CLASSIFICATION_VALUES.has(inner)) {
      return inner as ContainerClassification
    }
  }
  return null
}

// A child stored in a container is itself either a container or an item.
export const CONTAINER_CHILD_KIND_OPTIONS: SelectOption<ContainerChildKindType>[] = [
  { value: 'container', label: 'Container' },
  { value: 'item', label: 'Item' }
]

export function resolveChildKindFromSelect(value: unknown): ContainerChildKindType | null {
  if (value === 'container' || value === 'item') {
    return value
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (inner === 'container' || inner === 'item') {
      return inner
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Capacity editor: mode + entry factories
// ---------------------------------------------------------------------------
// The wire capacity is a discriminated union that is either empty ('none'),
// several numeric caps ('count'), or exactly one positional grid ('grid').
// The editor works in one of these three modes; switching mode transforms the
// current array, preserving childKind/type where it makes sense.

export type CapacityMode = 'none' | 'count' | 'grid'

const DEFAULT_CHILD_KIND: ContainerChildKindType = 'container'
const DEFAULT_CONTAINER_TYPE: ContainerType = 'Box'
const DEFAULT_ITEM_TYPE: ItemType = 'cryovial'
const DEFAULT_COUNT_CAPACITY = 10

function defaultTypeFor(childKind: ContainerChildKindType): ChildCategory {
  return childKind === 'item' ? DEFAULT_ITEM_TYPE : DEFAULT_CONTAINER_TYPE
}

// Structural seed of a capacity entry: accepts either the form/input shape (grid
// `levels` optional) or the parsed/output shape, so callers can pass either.
interface CapacitySeed {
  layout: 'count' | 'grid'
  childKind: ContainerChildKindType
  type: ChildCategory
  capacity?: number
  rows?: number
  columns?: number
  levels?: number
}

export function capacityMode(capacity: ReadonlyArray<{ layout: 'count' | 'grid' }> | null | undefined): CapacityMode {
  if (!capacity || capacity.length === 0) return 'none'
  return capacity[0]?.layout === 'grid' ? 'grid' : 'count'
}

export function makeCountRow(
  childKind: ContainerChildKindType = DEFAULT_CHILD_KIND,
  type: ChildCategory = defaultTypeFor(childKind),
  capacity: number = DEFAULT_COUNT_CAPACITY
): Extract<ContainerCapacity, { layout: 'count' }> {
  return { layout: 'count', childKind, type, capacity }
}

export function makeGridEntry(
  childKind: ContainerChildKindType = DEFAULT_CHILD_KIND,
  type: ChildCategory = defaultTypeFor(childKind),
  rows = 9,
  columns = 9,
  levels = 1
): Extract<ContainerCapacity, { layout: 'grid' }> {
  return { layout: 'grid', childKind, type, rows, columns, levels }
}

// Project the stored ContainerCapacityEntry[] (which carries the server-owned `stored`
// occupancy) onto the wire/form shape ContainerCapacity[] the capacity editor works with,
// dropping `stored`. Analogue of the equipment displayCapacityToFormCapacity helper.
export function containerCapacityEntriesToForm(
  capacity: ContainerCapacityEntry[] | null | undefined
): ContainerCapacity[] {
  if (!capacity || capacity.length === 0) return []
  return capacity.map(entry =>
    entry.layout === 'grid'
      ? makeGridEntry(entry.childKind, entry.type, entry.rows, entry.columns, entry.levels)
      : makeCountRow(entry.childKind, entry.type, entry.capacity)
  )
}

// Transform the current capacity array to match a newly selected mode. Reuses the
// first entry's childKind/type as a sensible seed so switching feels non-destructive.
// Entries are always rebuilt through the factories, so the result is well-typed
// regardless of whether the input used the form (input) or parsed (output) shape.
export function convertCapacityMode(current: ReadonlyArray<CapacitySeed> | null | undefined, mode: CapacityMode): ContainerCapacity[] {
  const entries = current ?? []
  const seed = entries[0]

  if (mode === 'none') return []

  if (mode === 'grid') {
    if (seed?.layout === 'grid') {
      return [makeGridEntry(seed.childKind, seed.type, seed.rows ?? 9, seed.columns ?? 9, seed.levels ?? 1)]
    }
    return [makeGridEntry(seed?.childKind, seed?.type)]
  }

  // mode === 'count'
  const countEntries = entries.filter(entry => entry.layout === 'count')
  if (countEntries.length > 0) {
    return countEntries.map(entry => makeCountRow(entry.childKind, entry.type, entry.capacity ?? DEFAULT_COUNT_CAPACITY))
  }
  return [makeCountRow(seed?.childKind, seed?.type)]
}
