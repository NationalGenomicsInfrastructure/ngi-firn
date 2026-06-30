import type {
  SciLifeLabBuilding,
  RoomType
} from '~~/schemas/inventory/rooms'
import type { Room } from '~~/types/inventory'

export interface SelectOption<T extends string> {
  value: T
  label: string
}
export interface RoomInfoField {
  icon: string
  label: string
  value: string
}

export const ROOM_FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'
export const ROOM_EDIT_FORM_ID_PREFIX = 'inventory-room-edit-'

export const ROOM_TYPE_OPTIONS: SelectOption<RoomType>[] = [
  { value: 'Basement', label: 'Basement' },
  { value: 'Laboratory', label: 'Laboratory' },
  { value: 'Office', label: 'Office' },
  { value: 'Storage', label: 'Storage' },
  { value: 'Other', label: 'Other' }
]

export const BUILDING_OPTIONS: SelectOption<SciLifeLabBuilding>[] = [
  { value: 'Alfa', label: 'Alfa' },
  { value: 'Beta', label: 'Beta' },
  { value: 'Gamma', label: 'Gamma' },
  { value: 'Delta', label: 'Delta' }
]

export const ROOM_TYPE_BADGE_STYLES: Record<RoomType, { badge: string, icon: string }> = {
  Basement: { badge: 'solid-gray', icon: 'i-lucide-arrow-down-to-line' },
  Laboratory: { badge: 'solid-primary', icon: 'i-lucide-flask-conical' },
  Office: { badge: 'solid-success', icon: 'i-lucide-briefcase' },
  Storage: { badge: 'solid-indigo', icon: 'i-lucide-package' },
  Other: { badge: 'solid-gray', icon: 'i-lucide-shapes' }
}

export function getRoomTypeLabel(roomType: RoomType): string {
  return ROOM_TYPE_OPTIONS.find(option => option.value === roomType)?.label ?? roomType
}

export function getRoomDetailPath(slug: string): string {
  return `/inventory/rooms/${encodeURIComponent(slug)}`
}

export function getRoomInfoFields(room: Room): RoomInfoField[] {
  return [
    { icon: 'i-lucide-key-round', label: 'Room identifier', value: room.slug },
    { icon: 'i-lucide-building-2', label: 'Building', value: room.building },
    { icon: 'i-lucide-door-open', label: 'Room number', value: String(room.roomNumber) },
    { icon: 'i-lucide-layers', label: 'Floor', value: String(room.floor) },
    { icon: 'i-lucide-align-left', label: 'Description', value: room.description ?? '—' }
  ]
}

export async function focusFirstFormFieldError(errors: Record<string, unknown>): Promise<void> {
  const firstFieldName = Object.keys(errors)[0]
  if (!firstFieldName || typeof document === 'undefined') {
    return
  }

  const firstField = document.querySelector(`[name="${firstFieldName}"]`) as HTMLElement | null
  if (!firstField) {
    return
  }

  firstField.focus()
  firstField.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
