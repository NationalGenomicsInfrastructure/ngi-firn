import type {
  CreateItemSchemaInput,
  UpdateItemSchemaInput
} from '~~/schemas/inventory-items'
import type { InventoryItem } from '~~/types/inventory'

export const ITEM_FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

export const ITEM_CATEGORY_OPTIONS: Array<{
  label: string
  value: CreateItemSchemaInput['category']
}> = [
  { label: 'Eppendorf', value: 'eppendorf' },
  { label: 'Falcon', value: 'falcon' },
  { label: 'Cryovial', value: 'cryovial' },
  { label: 'Vial', value: 'vial' },
  { label: 'Bottle', value: 'bottle' },
  { label: 'Plate 96-well', value: 'plate96' },
  { label: 'Plate 384-well', value: 'plate384' },
  { label: 'Microscopy slide', value: 'microscopySlide' },
  { label: 'Other', value: 'other' }
]

export const ITEM_CATEGORY_LABELS: Record<InventoryItem['category'], string> = {
  eppendorf: 'Eppendorf',
  falcon: 'Falcon',
  cryovial: 'Cryovial',
  vial: 'Vial',
  bottle: 'Bottle',
  plate96: 'Plate 96-well',
  plate384: 'Plate 384-well',
  microscopySlide: 'Microscopy slide',
  other: 'Other'
}

export const ITEM_CLASSIFICATION_OPTIONS: Array<{
  label: string
  value: CreateItemSchemaInput['classification']
}> = [
  { label: 'Sample', value: 'sample' },
  { label: 'Reagent', value: 'reagent' },
  { label: 'Library', value: 'library' },
  { label: 'Consumable', value: 'consumable' },
  { label: 'Equipment', value: 'equipment' },
  { label: 'Other', value: 'other' }
]

export const ITEM_CLASSIFICATION_LABELS: Record<InventoryItem['classification'], string> = {
  sample: 'Sample',
  reagent: 'Reagent',
  library: 'Library',
  consumable: 'Consumable',
  equipment: 'Equipment',
  other: 'Other'
}

export const ITEM_STATUS_OPTIONS: Array<{
  label: string
  value: InventoryItem['status']
}> = [
  { label: 'Available', value: 'available' },
  { label: 'Checked out', value: 'checked_out' },
  { label: 'Reserved', value: 'reserved' },
  { label: 'Expired', value: 'expired' },
  { label: 'Disposed', value: 'disposed' },
  { label: 'Lost', value: 'lost' },
  { label: 'Damaged', value: 'damaged' }
]

export const ITEM_STATUS_LABELS: Record<InventoryItem['status'], string> = {
  available: 'Available',
  checked_out: 'Checked out',
  reserved: 'Reserved',
  expired: 'Expired',
  disposed: 'Disposed',
  lost: 'Lost',
  damaged: 'Damaged'
}

export type ItemFormInitialValues = {
  name: string
  label: string
  category: CreateItemSchemaInput['category']
  classification: CreateItemSchemaInput['classification']
  status: InventoryItem['status']
  quantity: number | undefined
  unit: string
  concentration: number | undefined
  concentrationUnit: string
  expiryDate: string
  lotNumber: string
  barcode: string
  notes: string
}

export type ItemFormSubmitValues = {
  name: string
  label?: string | null
  category: CreateItemSchemaInput['category']
  classification: CreateItemSchemaInput['classification']
  status?: InventoryItem['status']
  quantity?: number | null
  unit?: string | null
  concentration?: number | null
  concentrationUnit?: string | null
  expiryDate?: string | null
  lotNumber?: string | null
  barcode?: string | null
  notes?: string | null
}

export function createEmptyItemFormValues(): ItemFormInitialValues {
  return {
    name: '',
    label: '',
    category: 'eppendorf',
    classification: 'sample',
    status: 'available',
    quantity: undefined,
    unit: '',
    concentration: undefined,
    concentrationUnit: '',
    expiryDate: '',
    lotNumber: '',
    barcode: '',
    notes: ''
  }
}

export function createItemFormValuesFromItem(item: InventoryItem): ItemFormInitialValues {
  return {
    name: item.name,
    label: item.label ?? '',
    category: item.category,
    classification: item.classification,
    status: item.status,
    quantity: item.quantity ?? undefined,
    unit: item.unit ?? '',
    concentration: item.concentration ?? undefined,
    concentrationUnit: item.concentrationUnit ?? '',
    expiryDate: item.expiryDate ?? '',
    lotNumber: item.lotNumber ?? '',
    barcode: item.barcode ?? '',
    notes: item.notes ?? ''
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

export function resolveItemCategoryFromSelect(value: unknown): CreateItemSchemaInput['category'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return ITEM_CATEGORY_OPTIONS.find(item => item.value === raw)?.value
}

export function resolveItemClassificationFromSelect(value: unknown): CreateItemSchemaInput['classification'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return ITEM_CLASSIFICATION_OPTIONS.find(item => item.value === raw)?.value
}

export function resolveItemStatusFromSelect(value: unknown): InventoryItem['status'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return ITEM_STATUS_OPTIONS.find(item => item.value === raw)?.value
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

export function mapItemFormValuesToUpdatePayload(
  item: InventoryItem,
  values: ItemFormSubmitValues
): UpdateItemSchemaInput {
  return {
    id: item._id,
    rev: item._rev,
    name: values.name.trim(),
    label: normalizeOptionalStringForUpdate(values.label),
    category: values.category,
    classification: values.classification,
    status: values.status,
    quantity: values.quantity !== undefined ? values.quantity : null,
    unit: normalizeOptionalStringForUpdate(values.unit),
    concentration: values.concentration !== undefined ? values.concentration : null,
    concentrationUnit: normalizeOptionalStringForUpdate(values.concentrationUnit),
    expiryDate: normalizeOptionalStringForUpdate(values.expiryDate),
    lotNumber: normalizeOptionalStringForUpdate(values.lotNumber),
    barcode: normalizeOptionalStringForUpdate(values.barcode),
    notes: normalizeOptionalStringForUpdate(values.notes)
  }
}
