import type { EquipmentType } from '~~/schemas/inventory/equipment'
import type { ContainerType } from '~~/schemas/inventory/container'
import type { DisplayStorageEquipment } from '~~/types/inventory'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export const EQUIPMENT_FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

export const EQUIPMENT_TYPE_OPTIONS: SelectOption<EquipmentType>[] = [
  { value: 'Cabinet', label: 'Cabinet' },
  { value: 'Freezer', label: 'Freezer' },
  { value: 'Fridge', label: 'Fridge' },
  { value: 'Shelf', label: 'Shelf' },
  { value: 'NitrogenTank', label: 'Nitrogen tank' },
  { value: 'Other', label: 'Other' }
]

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  Cabinet: 'Cabinet',
  Freezer: 'Freezer',
  Fridge: 'Fridge',
  Shelf: 'Shelf',
  NitrogenTank: 'Nitrogen tank',
  Other: 'Other'
}

export function resolveEquipmentTypeFromSelect(value: unknown): EquipmentType | null {
  const VALID: EquipmentType[] = ['Cabinet', 'Freezer', 'Fridge', 'Shelf', 'NitrogenTank', 'Other']

  if (typeof value === 'string' && (VALID as string[]).includes(value)) {
    return value as EquipmentType
  }

  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (typeof inner === 'string' && (VALID as string[]).includes(inner)) {
      return inner as EquipmentType
    }
  }

  return null
}

export function resolveNullableNumberFromInput(value: unknown): number | undefined {
  if (value === '' || value == null) {
    return undefined
  }
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

export function getEquipmentDetailPath(slug: string): string {
  return `/inventory/equipment/${encodeURIComponent(slug)}`
}

export function getEquipmentCapacityLabel(equipment: DisplayStorageEquipment): string {
  if (!equipment.capacity || equipment.capacity.length === 0) {
    return '—'
  }
  return `${equipment.capacity.length} type${equipment.capacity.length === 1 ? '' : 's'} configured`
}

/*
 * Container-type capacity editor helpers
 */

export const CONTAINER_TYPE_OPTIONS: SelectOption<ContainerType>[] = [
  { value: 'Bag', label: 'Bag' },
  { value: 'Bin', label: 'Bin' },
  { value: 'Block', label: 'Block' },
  { value: 'Box', label: 'Box' },
  { value: 'Cane', label: 'Cane' },
  { value: 'Goblet', label: 'Goblet' },
  { value: 'Rack', label: 'Rack' },
  { value: 'Tray', label: 'Tray' },
  { value: 'Other', label: 'Other' }
]

export const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  Bag: 'Bag',
  Bin: 'Bin',
  Block: 'Block',
  Box: 'Box',
  Cane: 'Cane',
  Goblet: 'Goblet',
  Rack: 'Rack',
  Tray: 'Tray',
  Other: 'Other'
}

// Icon per container type. Dynamic (bound from this map), so every i-lucide-* here
// must also live in uno.config.ts `safelist`.
export const CONTAINER_TYPE_ICONS: Record<ContainerType, string> = {
  Bag: 'i-lucide-paper-bag',
  Bin: 'i-lucide-shopping-basket',
  Block: 'i-lucide-cuboid',
  Box: 'i-lucide-package',
  Cane: 'i-lucide-pipette',
  Goblet: 'i-lucide-cylinder',
  Rack: 'i-lucide-table',
  Tray: 'i-lucide-square-library',
  Other: 'i-lucide-proportions'
}
export interface CapacityRow {
  type: ContainerType
  capacity: number
}

export function resolveContainerTypeFromSelect(value: unknown): ContainerType | null {
  const VALID: ContainerType[] = ['Bag', 'Bin', 'Block', 'Box', 'Cane', 'Goblet', 'Rack', 'Tray', 'Other']

  if (typeof value === 'string' && (VALID as string[]).includes(value)) {
    return value as ContainerType
  }

  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (typeof inner === 'string' && (VALID as string[]).includes(inner)) {
      return inner as ContainerType
    }
  }

  return null
}

// Project the stored EquipmentCapacityEntry[] shape onto the flat form rows
// ({ type, capacity }[]) that the capacity editor works with, dropping the
// server-owned `stored` counter.
export function displayCapacityToFormCapacity(
  capacity: DisplayStorageEquipment['capacity']
): CapacityRow[] {
  if (!capacity) {
    return []
  }

  // Skip entries without a valid container type so that malformed
  // documents degrade to "no restriction" instead of crashing the UI.
  return capacity
    .filter(entry => entry && entry.type in CONTAINER_TYPE_LABELS)
    .map(entry => ({ type: entry.type, capacity: entry.capacity }))
}
