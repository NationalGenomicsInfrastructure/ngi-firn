import type { ItemType } from '~~/schemas/inventory/items'
import type { ContainerType, ContainerChildKindType } from '~~/schemas/inventory/container'
import { CONTAINER_TYPE_ICONS, CONTAINER_TYPE_LABELS, type SelectOption } from './equipment'

// Human-readable labels for each item form factor.
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  ampoule: 'Ampoule',
  blottingMembrane: 'Blotting membrane',
  bottle: 'Bottle',
  capillary: 'Capillary',
  cassette: 'Cassette',
  conicalTube: 'Conical tube',
  cryovial: 'Cryovial',
  cuvette: 'Cuvette',
  jar: 'Jar',
  microcentrifugeTube: 'Microcentrifuge tube',
  microscopySlide: 'Microscopy slide',
  pcrStrip: 'PCR strip',
  petriDish: 'Petri dish',
  plate: 'Plate',
  spinColumn: 'Spin column',
  vial: 'Vial',
  other: 'Other'
}

// Icon per item type. Dynamic (bound from this map), so every i-lucide-* here
// must also live in uno.config.ts `safelist`.
export const ITEM_TYPE_ICONS: Record<ItemType, string> = {
  ampoule: 'i-lucide-flask-round',
  blottingMembrane: 'i-lucide-scan-line',
  bottle: 'i-lucide-milk',
  capillary: 'i-lucide-pen-line',
  cassette: 'i-lucide-cassette-tape',
  conicalTube: 'i-lucide-cone',
  cryovial: 'i-lucide-test-tube',
  cuvette: 'i-lucide-rectangle-vertical',
  jar: 'i-lucide-cooking-pot',
  microcentrifugeTube: 'i-lucide-test-tube-diagonal',
  microscopySlide: 'i-lucide-microscope',
  pcrStrip: 'i-lucide-align-justify',
  petriDish: 'i-lucide-disc',
  plate: 'i-lucide-grid-3x3',
  spinColumn: 'i-lucide-filter',
  vial: 'i-lucide-test-tubes',
  other: 'i-lucide-shapes'
}

// Select options for item form factors, derived from the label map.
export const ITEM_TYPE_OPTIONS: SelectOption<ItemType>[] = (
  Object.keys(ITEM_TYPE_LABELS) as ItemType[]
).map(value => ({ value, label: ITEM_TYPE_LABELS[value] }))

export function resolveItemTypeFromSelect(value: unknown): ItemType | null {
  if (typeof value === 'string' && value in ITEM_TYPE_LABELS) {
    return value as ItemType
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (typeof inner === 'string' && inner in ITEM_TYPE_LABELS) {
      return inner as ItemType
    }
  }
  return null
}

export interface ChildTypeMeta {
  label: string
  icon: string
}

const CHILD_TYPE_FALLBACK: ChildTypeMeta = { label: 'Unknown', icon: 'i-lucide-shapes' }

/*
 * Resolve a capacity entry's `type` against the correct vocabulary. A container's capacity
 * entry can reference either a ContainerType or an ItemType; `childKind` disambiguates them
 * (they can even collide by case, e.g. container 'Other' vs item 'other'). Falls back to a
 * generic label/icon for malformed data so the UI degrades gracefully.
 */
export function getChildTypeMeta(childKind: ContainerChildKindType, type: string): ChildTypeMeta {
  if (childKind === 'item') {
    const itemType = type as ItemType
    if (itemType in ITEM_TYPE_LABELS) {
      return { label: ITEM_TYPE_LABELS[itemType], icon: ITEM_TYPE_ICONS[itemType] }
    }
    return { ...CHILD_TYPE_FALLBACK, label: type }
  }

  const containerType = type as ContainerType
  if (containerType in CONTAINER_TYPE_LABELS) {
    return { label: CONTAINER_TYPE_LABELS[containerType], icon: CONTAINER_TYPE_ICONS[containerType] }
  }
  return { ...CHILD_TYPE_FALLBACK, label: type }
}
