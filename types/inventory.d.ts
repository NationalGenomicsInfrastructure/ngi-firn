import type { BaseDocument } from '../server/database/couchdb'

// Define the Room type for CouchDB documents
export interface Room extends BaseDocument {
    type: 'room'
    schema: 1
    roomNumber: string
    roomName: string
    roomType: 'basement' | 'laboratory' | 'office' | 'storage' | 'other'
    roomID: string
    building: string
    floor: number
    description: string | null
}

// Define the StorageEnvironment type for CouchDB documents
export interface StorageEnvironment extends BaseDocument {
  type: 'storageEnvironment'
  schema: 1
  category: 'cabinet' | 'freezer' | 'fridge' | 'shelf' | 'nitrogenTank' | 'other'
  name: string
  label: string
  storageEnvironmentID: string
  temperature: number | null
  room: string
  description: string | null
  capacity: number | null
  units: StorageUnit[]
}

// Define the StorageUnit type for CouchDB documents
export interface StorageUnit extends BaseDocument {
  type: 'storageUnit'
  schema: 1
  category: 'box' | 'bag' | 'bottle' | 'jar' | 'other' | 'rack'
  classification: 'sample' | 'reagent' | 'equipment' | 'consumable' | 'other'
  name: string
  label: string
  storageUnitID: string
  items: StorageItem[]
}

// Define the StorageItem
export interface StorageItem extends BaseDocument {
  type: 'storageItem'
  schema: 1
  category: 'eppendorf' | 'falcon' | 'microscopySlide' | 'plate' | 'other' | 'vial'
  classification: 'sample' | 'reagent' | 'equipment' | 'consumable' | 'other'
  name: string
  label: string
  storageItemID: string
  description: string | null
  quantity: number | null
  unit: string | null
  location: string | null
  status: 'available' | 'in use' | 'reserved' | 'lost' | 'damaged' | 'other'
  notes: string | null
  createdAt: string
  updatedAt: string
}