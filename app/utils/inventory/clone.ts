import type {
  DisplayContainer,
  DisplayInventoryItem,
  DisplayStorageEquipment
} from '~~/types/inventory'
import type { CreateEquipmentFormValues } from '~~/schemas/inventory/equipment'
import type { CreateContainerFormValues } from '~~/schemas/inventory/container'
import type { CreateItemFormValues } from '~~/schemas/inventory/items'
import {
  displayCapacityToFormCapacity,
  displayItemCapacityToFormCapacity
} from './equipment'
import { containerCapacityEntriesToForm } from './container'

export type CloneInventorySource
  = | { kind: 'equipment', entity: DisplayStorageEquipment }
    | { kind: 'container', entity: DisplayContainer }
    | { kind: 'item', entity: DisplayInventoryItem }

export function equipmentCloneFormValues(
  equipment: DisplayStorageEquipment
): CreateEquipmentFormValues {
  return {
    equipmentType: equipment.equipmentType,
    name: '',
    label: '',
    description: equipment.description ?? '',
    capacity: displayCapacityToFormCapacity(equipment.capacity),
    itemCapacity: displayItemCapacityToFormCapacity(equipment.itemCapacity),
    temperatureCategory: equipment.temperatureCategory ?? undefined,
    temperatureCelsius: equipment.temperatureCelsius ?? undefined,
    manufacturer: equipment.manufacturer ?? '',
    model: equipment.model ?? '',
    serialNumber: '',
    isActive: equipment.isActive
  }
}

export function containerCloneFormValues(
  container: DisplayContainer
): CreateContainerFormValues {
  return {
    containerType: container.containerType,
    classification: container.classification ?? 'Sample',
    name: '',
    label: '',
    description: container.description ?? '',
    temperatureCategory: container.temperatureCategory ?? undefined,
    temperatureCelsius: container.temperatureCelsius ?? undefined,
    capacity: containerCapacityEntriesToForm(container.capacity)
  }
}

export function itemCloneFormValues(
  item: DisplayInventoryItem
): CreateItemFormValues {
  return {
    category: item.category,
    classification: item.classification ?? undefined,
    name: '',
    label: '',
    description: item.description ?? '',
    quantity: item.quantity ?? undefined,
    unit: item.unit ?? '',
    concentration: item.concentration ?? undefined,
    concentrationUnit: item.concentrationUnit ?? '',
    temperatureCategory: item.temperatureCategory ?? undefined,
    temperatureCelsius: item.temperatureCelsius ?? undefined,
    arrivalDate: '',
    openingDate: '',
    expiryDate: '',
    lotNumber: '',
    barcode: '',
    templateId: '',
    notes: item.notes ?? '',
    metadata: item.metadata == null ? undefined : structuredClone(item.metadata)
  }
}
