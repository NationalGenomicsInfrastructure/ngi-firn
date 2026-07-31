import type { InventoryClassificationType, InventoryStatusType } from '~~/schemas/inventory/metadata'
import type { ContainerCapacityEntry } from '~~/schemas/inventory/container'

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
