import type { EquipmentType } from '~~/schemas/inventory/equipment'
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
