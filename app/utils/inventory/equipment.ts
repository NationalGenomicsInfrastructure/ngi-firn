import type {
  CreateEquipmentSchemaInput,
  UpdateEquipmentSchemaInput
} from '~~/schemas/inventory-locations'
import type { StorageEquipment } from '~~/types/inventory'

export const EQUIPMENT_FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

export const EQUIPMENT_TYPE_OPTIONS: Array<{
  label: string
  value: CreateEquipmentSchemaInput['equipmentType']
}> = [
  { label: 'Freezer', value: 'freezer' },
  { label: 'Fridge', value: 'fridge' },
  { label: 'Nitrogen tank', value: 'nitrogenTank' },
  { label: 'Cabinet', value: 'cabinet' },
  { label: 'Shelf', value: 'shelf' },
  { label: 'Other', value: 'other' }
]

export const EQUIPMENT_TYPE_LABELS: Record<StorageEquipment['equipmentType'], string> = {
  cabinet: 'Cabinet',
  freezer: 'Freezer',
  fridge: 'Fridge',
  shelf: 'Shelf',
  nitrogenTank: 'Nitrogen tank',
  other: 'Other'
}

export type EquipmentFormInitialValues = {
  equipmentType: CreateEquipmentSchemaInput['equipmentType']
  name: string
  label: string
  description: string
  rows: number | undefined
  columns: number | undefined
  levels: number | undefined
  temperatureCelsius: number | undefined
  capacity: number | undefined
  manufacturer: string
  model: string
  serialNumber: string
  isActive: boolean
}

export type EquipmentFormSubmitValues = {
  equipmentType: CreateEquipmentSchemaInput['equipmentType']
  name: string
  label?: string | null
  description?: string | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  temperatureCelsius?: number | null
  capacity?: number | null
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  isActive?: boolean
}

export function createEmptyEquipmentFormValues(): EquipmentFormInitialValues {
  return {
    equipmentType: 'freezer',
    name: '',
    label: '',
    description: '',
    rows: undefined,
    columns: undefined,
    levels: undefined,
    temperatureCelsius: undefined,
    capacity: undefined,
    manufacturer: '',
    model: '',
    serialNumber: '',
    isActive: true
  }
}

export function createEquipmentFormValuesFromEquipment(equipment: StorageEquipment): EquipmentFormInitialValues {
  return {
    equipmentType: equipment.equipmentType,
    name: equipment.name,
    label: equipment.label ?? '',
    description: equipment.description ?? '',
    rows: equipment.rows ?? undefined,
    columns: equipment.columns ?? undefined,
    levels: equipment.levels ?? undefined,
    temperatureCelsius: equipment.temperatureCelsius ?? undefined,
    capacity: equipment.capacity ?? undefined,
    manufacturer: equipment.manufacturer ?? '',
    model: equipment.model ?? '',
    serialNumber: equipment.serialNumber ?? '',
    isActive: equipment.isActive
  }
}

function extractSelectValue(value: unknown): string | undefined {
  if (value == null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined
  }

  if (typeof value === 'object' && 'value' in value) {
    const optionValue = (value as { value: unknown }).value
    return typeof optionValue === 'string' && optionValue.length > 0 ? optionValue : undefined
  }

  return undefined
}

export function resolveEquipmentTypeFromSelect(value: unknown): CreateEquipmentSchemaInput['equipmentType'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return EQUIPMENT_TYPE_OPTIONS.find(item => item.value === raw)?.value
}

export function resolveNullableNumberFromInput(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed != null && trimmed.length > 0 ? trimmed : undefined
}

function normalizeOptionalStringForUpdate(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed != null && trimmed.length > 0 ? trimmed : null
}

export function mapEquipmentFormValuesToCreatePayload(
  values: EquipmentFormSubmitValues,
  roomDocumentId: string
): CreateEquipmentSchemaInput {
  return {
    equipmentType: values.equipmentType,
    name: values.name.trim(),
    label: normalizeOptionalString(values.label),
    description: normalizeOptionalString(values.description),
    parentId: roomDocumentId,
    rows: values.rows ?? undefined,
    columns: values.columns ?? undefined,
    levels: values.levels ?? undefined,
    temperatureCelsius: values.temperatureCelsius ?? undefined,
    capacity: values.capacity ?? undefined,
    manufacturer: normalizeOptionalString(values.manufacturer),
    model: normalizeOptionalString(values.model),
    serialNumber: normalizeOptionalString(values.serialNumber),
    isActive: values.isActive
  }
}

export function mapEquipmentFormValuesToUpdatePayload(
  equipment: StorageEquipment,
  values: EquipmentFormSubmitValues
): UpdateEquipmentSchemaInput {
  return {
    id: equipment._id,
    rev: equipment._rev,
    equipmentType: values.equipmentType,
    name: values.name.trim(),
    label: normalizeOptionalStringForUpdate(values.label),
    description: normalizeOptionalStringForUpdate(values.description),
    rows: values.rows !== undefined ? values.rows : null,
    columns: values.columns !== undefined ? values.columns : null,
    levels: values.levels !== undefined ? values.levels : null,
    temperatureCelsius: values.temperatureCelsius !== undefined ? values.temperatureCelsius : null,
    capacity: values.capacity !== undefined ? values.capacity : null,
    manufacturer: normalizeOptionalStringForUpdate(values.manufacturer),
    model: normalizeOptionalStringForUpdate(values.model),
    serialNumber: normalizeOptionalStringForUpdate(values.serialNumber),
    isActive: values.isActive
  }
}
