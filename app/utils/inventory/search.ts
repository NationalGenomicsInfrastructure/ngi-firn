import type { EquipmentType } from '~~/schemas/inventory/equipment'
import type { ContainerType } from '~~/schemas/inventory/container'
import type { ItemType } from '~~/schemas/inventory/items'
import type { RoomType } from '~~/schemas/inventory/rooms'
import type { InventoryStatusType } from '~~/schemas/inventory/metadata'
import type { SearchEntityKind, SearchInventoryHit } from '~~/types/search'
import { EQUIPMENT_TYPE_LABELS, CONTAINER_TYPE_LABELS } from './equipment'
import { ITEM_TYPE_LABELS } from './item'
import { getRoomTypeLabel } from './room'
import { getContainerStatusMeta, type StatusMeta } from './container'

/*
 * Client-side display metadata for a search hit. The search index stores raw subtype/status values
 * (so the server stays decoupled from client label maps); this module maps them to the same
 * human-readable labels, icons and badge variants used elsewhere in the inventory UI.
 *
 * Icons and badge variants here are bound dynamically, so every `i-lucide-*` and every
 * `badge~="solid-<color>"` used below must also be present in uno.config.ts `safelist`.
 */

export interface SearchKindMeta {
  label: string
  icon: string
  badge: string
}

export const SEARCH_KIND_META: Record<SearchEntityKind, SearchKindMeta> = {
  room: { label: 'Room', icon: 'i-lucide-door-open', badge: 'solid-indigo' },
  equipment: { label: 'Equipment', icon: 'i-lucide-refrigerator', badge: 'solid-primary' },
  container: { label: 'Container', icon: 'i-lucide-box', badge: 'solid-yellow' },
  item: { label: 'Item', icon: 'i-lucide-test-tube', badge: 'solid-success' }
}

export function getSearchKindMeta(kind: SearchEntityKind): SearchKindMeta {
  return SEARCH_KIND_META[kind]
}

/* Resolve the human-readable subtype label for a hit using the per-kind vocabulary. */
export function getHitSubtypeLabel(hit: SearchInventoryHit): string | null {
  if (!hit.subtype) {
    return null
  }
  switch (hit.kind) {
    case 'room':
      return getRoomTypeLabel(hit.subtype as RoomType)
    case 'equipment':
      return EQUIPMENT_TYPE_LABELS[hit.subtype as EquipmentType] ?? hit.subtype
    case 'container':
      return CONTAINER_TYPE_LABELS[hit.subtype as ContainerType] ?? hit.subtype
    case 'item':
      return ITEM_TYPE_LABELS[hit.subtype as ItemType] ?? hit.subtype
  }
}

/* Status badge metadata for container/item hits; null for rooms/equipment (which use isActive). */
export function getHitStatusMeta(hit: SearchInventoryHit): StatusMeta | null {
  if ((hit.kind === 'container' || hit.kind === 'item') && hit.status) {
    return getContainerStatusMeta(hit.status as InventoryStatusType)
  }
  return null
}

/* Active/inactive badge metadata for room/equipment hits; null for container/item. */
export function getHitActiveMeta(hit: SearchInventoryHit): SearchKindMeta | null {
  if (hit.kind !== 'room' && hit.kind !== 'equipment') {
    return null
  }
  if (hit.isActive === false) {
    return { label: 'Inactive', icon: 'i-lucide-ban', badge: 'solid-gray' }
  }
  return { label: 'Active', icon: 'i-lucide-circle-check', badge: 'solid-success' }
}

/* The entity kinds offered as filter toggles, in display order. */
export const SEARCH_KIND_FILTER_ORDER: SearchEntityKind[] = ['room', 'equipment', 'container', 'item']
