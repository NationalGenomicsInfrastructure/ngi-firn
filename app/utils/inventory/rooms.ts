import type { CreateRoomSchemaInput, UpdateRoomSchemaInput } from '~~/schemas/inventory-locations'
import type { Room } from '~~/types/inventory'

export const ROOM_FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

export const ROOM_TYPE_OPTIONS: Array<{ label: string, value: CreateRoomSchemaInput['roomType'] }> = [
  { label: 'Laboratory', value: 'laboratory' },
  { label: 'Storage', value: 'storage' },
  { label: 'Basement', value: 'basement' },
  { label: 'Office', value: 'office' },
  { label: 'Other', value: 'other' }
]

export const BUILDING_OPTIONS: Array<{ label: string, value: CreateRoomSchemaInput['building'] }> = [
  { label: 'Alfa', value: 'alfa' },
  { label: 'Beta', value: 'beta' },
  { label: 'Gamma', value: 'gamma' },
  { label: 'Delta', value: 'delta' }
]

/** Initial values for vee-validate (floor may be unset until the user fills it in). */
export type RoomFormInitialValues = {
  name: string
  label: string
  roomNumber: string
  roomType: CreateRoomSchemaInput['roomType']
  building: CreateRoomSchemaInput['building']
  floor: number | undefined
  description: string
  isActive: boolean
}

/** Validated form output from `createRoomSchema`. */
export type RoomFormSubmitValues = {
  name: string
  label?: string
  roomNumber: string
  roomType: CreateRoomSchemaInput['roomType']
  building: CreateRoomSchemaInput['building']
  floor: number
  description?: string | null
  isActive?: boolean
}

export function createEmptyRoomFormValues(): RoomFormInitialValues {
  return {
    name: '',
    label: '',
    roomNumber: '',
    roomType: 'laboratory',
    building: 'alfa',
    floor: undefined,
    description: '',
    isActive: true
  }
}

export function createRoomFormValuesFromRoom(room: Room): RoomFormInitialValues {
  return {
    name: room.name,
    label: room.label ?? '',
    roomNumber: room.roomNumber ?? '',
    roomType: room.roomType,
    building: room.building,
    floor: room.floor ?? undefined,
    description: room.description ?? '',
    isActive: room.isActive
  }
}

export function buildGeneratedRoomId(
  building: CreateRoomSchemaInput['building'] | undefined,
  floor: number | undefined,
  roomNumber: string | undefined
): string {
  if (building == null || floor == null) {
    return ''
  }

  const normalizedRoomNumber = roomNumber?.trim().replace(/\s+/g, '') ?? ''
  if (normalizedRoomNumber.length === 0) {
    return ''
  }

  return `${building}-${floor}-${normalizedRoomNumber}`
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

export function resolveRoomTypeFromSelect(value: unknown): CreateRoomSchemaInput['roomType'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return ROOM_TYPE_OPTIONS.find(item => item.value === raw)?.value
}

export function resolveBuildingFromSelect(value: unknown): CreateRoomSchemaInput['building'] | undefined {
  const raw = extractSelectValue(value)
  if (!raw) {
    return undefined
  }

  return BUILDING_OPTIONS.find(item => item.value === raw)?.value
}

export function resolveFloorFromInput(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function mapRoomFormValuesToCreatePayload(values: RoomFormSubmitValues): CreateRoomSchemaInput {
  return {
    name: values.name.trim(),
    label: values.label?.trim() ?? undefined,
    roomNumber: values.roomNumber.trim(),
    roomType: values.roomType,
    building: values.building,
    floor: values.floor,
    description: values.description?.trim() ? values.description.trim() : undefined,
    isActive: values.isActive
  }
}

export function mapRoomFormValuesToUpdatePayload(room: Room, values: RoomFormSubmitValues): UpdateRoomSchemaInput {
  return {
    id: room._id,
    rev: room._rev,
    ...mapRoomFormValuesToCreatePayload(values)
  }
}

export async function focusFirstFormFieldError(errors: Record<string, unknown>) {
  const firstErrorField = Object.keys(errors)[0]
  if (!firstErrorField) {
    return
  }

  const firstErrorFieldElement = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement | null
  if (firstErrorFieldElement) {
    firstErrorFieldElement.focus()
    firstErrorFieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
