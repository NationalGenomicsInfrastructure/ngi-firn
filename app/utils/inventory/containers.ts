import type {
  CreateContainerSchemaInput,
  UpdateContainerSchemaInput
} from '~~/schemas/inventory-containers'
import type { Container } from '~~/types/inventory'

export const CONTAINER_FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

export const CONTAINER_TYPE_OPTIONS: Array<{
  label: string
  value: CreateContainerSchemaInput['containerType']
}> = [
  { label: 'Box', value: 'box' },
  { label: 'Rack', value: 'rack' },
  { label: 'Bag', value: 'bag' },
  { label: 'Tray', value: 'tray' },
  { label: 'Other', value: 'other' }
]

export const CONTAINER_TYPE_LABELS: Record<Container['containerType'], string> = {
  box: 'Box',
  rack: 'Rack',
  bag: 'Bag',
  tray: 'Tray',
  other: 'Other'
}

export const CONTAINER_CLASSIFICATION_OPTIONS: Array<{
  label: string
  value: CreateContainerSchemaInput['classification']
}> = [
  { label: 'Sample', value: 'sample' },
  { label: 'Reagent', value: 'reagent' },
  { label: 'Equipment', value: 'equipment' },
  { label: 'Consumable', value: 'consumable' },
  { label: 'Other', value: 'other' }
]

export const CONTAINER_CLASSIFICATION_LABELS: Record<Container['classification'], string> = {
  sample: 'Sample',
  reagent: 'Reagent',
  equipment: 'Equipment',
  consumable: 'Consumable',
  other: 'Other'
}

export interface AcceptanceCategoryOption {
  label: string
  value: string
  icon: string
}

/*
 * Options for the acceptedItemCategories multi-select.
 * These match the `category` values on InventoryItem.
 */
export const ACCEPTED_ITEM_CATEGORY_OPTIONS: AcceptanceCategoryOption[] = [
  { label: 'Eppendorf', value: 'eppendorf', icon: 'i-lucide-test-tube-diagonal' },
  { label: 'Falcon', value: 'falcon', icon: 'i-lucide-flask-conical' },
  { label: 'Cryovial', value: 'cryovial', icon: 'i-lucide-snowflake' },
  { label: 'Vial', value: 'vial', icon: 'i-lucide-test-tube' },
  { label: 'Bottle', value: 'bottle', icon: 'i-lucide-flask-round' },
  { label: 'Jar', value: 'jar', icon: 'i-lucide-cylinder' },
  { label: 'Plate 96', value: 'plate96', icon: 'i-lucide-grid-2x2' },
  { label: 'Plate 384', value: 'plate384', icon: 'i-lucide-grid-3x3' },
  { label: 'Slide', value: 'microscopySlide', icon: 'i-lucide-mirror-rectangular' },
  { label: 'Other', value: 'other', icon: 'i-lucide-help-circle' }
]

/*
 * Options for the acceptedContainerCategories multi-select.
 * These match the `containerType` values on Container.
 */
export const ACCEPTED_CONTAINER_CATEGORY_OPTIONS: AcceptanceCategoryOption[] = [
  { label: 'Box', value: 'box', icon: 'i-lucide-box' },
  { label: 'Rack', value: 'rack', icon: 'i-lucide-columns-3' },
  { label: 'Bag', value: 'bag', icon: 'i-lucide-shopping-bag' },
  { label: 'Tray', value: 'tray', icon: 'i-lucide-grid-3x3' },
  { label: 'Other', value: 'other', icon: 'i-lucide-help-circle' }
]

export interface ContainerDimensionFields {
  grid: boolean // rows + columns
  levels: boolean // 3rd dimension
  capacity: boolean // standalone "max direct children"
}

/*
 * Which storage-layout fields make sense per container type.
 * Grid types (box/rack/tray) define slots via rows × columns, so their
 * capacity is derivable and hidden. Non-grid types expose capacity instead.
 */
export const CONTAINER_DIMENSION_FIELDS: Record<Container['containerType'], ContainerDimensionFields> = {
  box: { grid: true, levels: true, capacity: false },
  rack: { grid: true, levels: true, capacity: false },
  tray: { grid: true, levels: false, capacity: false },
  bag: { grid: false, levels: false, capacity: true },
  other: { grid: true, levels: true, capacity: true }
}

export type ContainerFormInitialValues = {
  containerType: CreateContainerSchemaInput['containerType']
  classification: CreateContainerSchemaInput['classification']
  name: string
  label: string
  description: string
  rows: number | undefined
  columns: number | undefined
  levels: number | undefined
  capacity: number | undefined
  acceptedItemCategories: string[]
  acceptedContainerCategories: string[]
  color: string
  isActive: boolean
}

export type ContainerFormSubmitValues = {
  containerType: CreateContainerSchemaInput['containerType']
  classification: CreateContainerSchemaInput['classification']
  name: string
  label?: string | null
  description?: string | null
  rows?: number | null
  columns?: number | null
  levels?: number | null
  capacity?: number | null
  acceptedItemCategories?: string[] | null
  acceptedContainerCategories?: string[] | null
  color?: string | null
  isActive?: boolean
}

export function createEmptyContainerFormValues(): ContainerFormInitialValues {
  return {
    containerType: 'box',
    classification: 'sample',
    name: '',
    label: '',
    description: '',
    rows: undefined,
    columns: undefined,
    levels: undefined,
    capacity: undefined,
    acceptedItemCategories: [],
    acceptedContainerCategories: [],
    color: '',
    isActive: true
  }
}

export function createContainerFormValuesFromContainer(container: Container): ContainerFormInitialValues {
  return {
    containerType: container.containerType,
    classification: container.classification,
    name: container.name,
    label: container.label ?? '',
    description: container.description ?? '',
    rows: container.rows ?? undefined,
    columns: container.columns ?? undefined,
    levels: container.levels ?? undefined,
    capacity: container.capacity ?? undefined,
    acceptedItemCategories: container.acceptedItemCategories ?? [],
    acceptedContainerCategories: container.acceptedContainerCategories ?? [],
    color: container.color ?? '',
    isActive: container.isActive
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

export function resolveContainerTypeFromSelect(value: unknown): CreateContainerSchemaInput['containerType'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return CONTAINER_TYPE_OPTIONS.find(item => item.value === raw)?.value
}

export function resolveContainerClassificationFromSelect(value: unknown): CreateContainerSchemaInput['classification'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return CONTAINER_CLASSIFICATION_OPTIONS.find(item => item.value === raw)?.value
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

function normalizeOptionalStringArray(value: string[] | null | undefined): string[] | undefined {
  if (!value || value.length === 0) {
    return undefined
  }
  return value
}

function normalizeOptionalStringArrayForUpdate(value: string[] | null | undefined): string[] | null {
  if (!value || value.length === 0) {
    return null
  }
  return value
}

export function mapContainerFormValuesToCreatePayload(
  values: ContainerFormSubmitValues,
  parentId: string
): CreateContainerSchemaInput {
  return {
    containerType: values.containerType,
    classification: values.classification,
    name: values.name.trim(),
    label: normalizeOptionalString(values.label),
    description: normalizeOptionalString(values.description),
    parentId,
    rows: values.rows ?? undefined,
    columns: values.columns ?? undefined,
    levels: values.levels ?? undefined,
    capacity: values.capacity ?? undefined,
    acceptedItemCategories: normalizeOptionalStringArray(values.acceptedItemCategories),
    acceptedContainerCategories: normalizeOptionalStringArray(values.acceptedContainerCategories),
    color: normalizeOptionalString(values.color),
    isActive: values.isActive
  }
}

export function mapContainerFormValuesToUpdatePayload(
  container: Container,
  values: ContainerFormSubmitValues
): UpdateContainerSchemaInput {
  return {
    id: container._id,
    rev: container._rev,
    containerType: values.containerType,
    classification: values.classification,
    name: values.name.trim(),
    label: normalizeOptionalStringForUpdate(values.label),
    description: normalizeOptionalStringForUpdate(values.description),
    rows: values.rows !== undefined ? values.rows : null,
    columns: values.columns !== undefined ? values.columns : null,
    levels: values.levels !== undefined ? values.levels : null,
    capacity: values.capacity !== undefined ? values.capacity : null,
    acceptedItemCategories: normalizeOptionalStringArrayForUpdate(values.acceptedItemCategories),
    acceptedContainerCategories: normalizeOptionalStringArrayForUpdate(values.acceptedContainerCategories),
    color: normalizeOptionalStringForUpdate(values.color),
    isActive: values.isActive
  }
}
