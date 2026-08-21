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
  { value: 'Dewar', label: 'Dewar' },
  { value: 'Freezer', label: 'Freezer' },
  { value: 'Fridge', label: 'Fridge' },
  { value: 'Incubator', label: 'Incubator' },
  { value: 'LabBench', label: 'Lab bench' },
  { value: 'ShelvingUnit', label: 'Shelving unit' },
  { value: 'NitrogenTank', label: 'Nitrogen tank' },
  { value: 'Other', label: 'Other' }
]

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  Cabinet: 'Cabinet',
  Dewar: 'Dewar',
  Freezer: 'Freezer',
  Fridge: 'Fridge',
  Incubator: 'Incubator',
  LabBench: 'Lab bench',
  ShelvingUnit: 'Shelving unit',
  NitrogenTank: 'Nitrogen tank',
  Other: 'Other'
}

export function resolveEquipmentTypeFromSelect(value: unknown): EquipmentType | null {
  const VALID: EquipmentType[] = ['Cabinet', 'Dewar', 'Freezer', 'Fridge', 'Incubator', 'LabBench', 'ShelvingUnit', 'NitrogenTank', 'Other']

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
  return `/inventory/equipment/${encodeURIComponent(slug)}/details`
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
  { value: 'Compartment', label: 'Compartment' },
  { value: 'Crate', label: 'Crate' },
  { value: 'Drawer', label: 'Drawer' },
  { value: 'Goblet', label: 'Goblet' },
  { value: 'Rack', label: 'Rack' },
  { value: 'Shelf', label: 'Shelf' },
  { value: 'Tray', label: 'Tray' },
  { value: 'Other', label: 'Other' }
]

export const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  Bag: 'Bag',
  Bin: 'Bin',
  Block: 'Block',
  Box: 'Box',
  Cane: 'Cane',
  Compartment: 'Compartment',
  Crate: 'Crate',
  Drawer: 'Drawer',
  Goblet: 'Goblet',
  Rack: 'Rack',
  Shelf: 'Shelf',
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
  Compartment: 'i-lucide-layout-grid',
  Crate: 'i-lucide-package-2',
  Drawer: 'i-lucide-bed-single',
  Goblet: 'i-lucide-life-buoy',
  Rack: 'i-lucide-table',
  Shelf: 'i-lucide-shelving-unit',
  Tray: 'i-lucide-square-library',
  Other: 'i-lucide-proportions'
}
export interface CapacityRow {
  type: ContainerType
  capacity: number
}

export function resolveContainerTypeFromSelect(value: unknown): ContainerType | null {
  const VALID: ContainerType[] = ['Bag', 'Bin', 'Block', 'Box', 'Cane', 'Compartment', 'Crate', 'Drawer', 'Goblet', 'Rack', 'Shelf', 'Tray', 'Other']

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
