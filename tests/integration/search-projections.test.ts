import { describe, expect, it } from 'vitest'
import {
  buildInventoryDetailUrl,
  buildProjectDetailUrl,
  makeSearchSafeId,
  toInventoryHit,
  toInventoryIndexDocument,
  toProjectIndexDocument,
  type StoredInventoryDoc
} from '../../server/search/projections'
import type { Container, InventoryItem, Room, StorageEquipment } from '../../types/inventory'
import type { ProjectsDbDocument } from '../../types/projects'

/*
 * Pure unit tests for the search projection layer. These exercise the denormalization logic
 * (kind mapping, location ancestry, project membership, open-shaped project field extraction)
 * without any Meilisearch or CouchDB dependency, so they run inside the standard integration
 * harness without a live engine.
 */

const room = {
  _id: 'room:1',
  type: 'room',
  slug: 'freezer-room',
  name: 'Freezer Room',
  label: null,
  roomType: 'cold_storage',
  isActive: true,
  description: 'Main cold room',
  updatedAt: '2024-01-01T00:00:00.000Z'
} as unknown as Room

const equipment = {
  _id: 'equip:1',
  type: 'storageEquipment',
  parent: { db: 'firn', id: 'room:1', type: 'room' },
  slug: 'ult-freezer-a',
  name: 'ULT Freezer A',
  label: null,
  barcode: 'EQ-123',
  equipmentType: 'ult_freezer',
  serialNumber: 'SN-9',
  description: null,
  isActive: true,
  updatedAt: '2024-01-02T00:00:00.000Z'
} as unknown as StorageEquipment

const container = {
  _id: 'cont:1',
  type: 'container',
  parent: { db: 'firn', id: 'equip:1', type: 'storageEquipment' },
  slug: 'rack-7',
  name: 'Rack 7',
  label: 'R7',
  barcode: 'CT-7',
  containerType: 'rack',
  classification: 'Sample',
  description: null,
  status: 'available',
  projectRefs: {
    'A.Doe_23_01': { db: 'projects', id: 'project:abc', slug: 'A.Doe_23_01', name: 'Doe Genome' }
  },
  updatedAt: '2024-01-03T00:00:00.000Z'
} as unknown as Container

const item = {
  _id: 'item:1',
  type: 'inventoryItem',
  parent: { db: 'firn', id: 'cont:1', type: 'container' },
  slug: 'tube-xyz',
  name: 'Tube XYZ',
  label: null,
  barcode: 'IT-9',
  category: 'tube',
  classification: 'Library',
  description: 'library prep',
  notes: 'handle cold',
  lotNumber: 'LOT-42',
  status: 'in_use',
  projectRefs: {
    'A.Doe_23_01': { db: 'projects', id: 'project:abc', slug: 'A.Doe_23_01', name: 'Doe Genome' },
    'B.Roe_24_02': [{ db: 'projects', id: 'project:def', slug: 'B.Roe_24_02', name: 'Roe Panel' }]
  },
  updatedAt: '2024-01-04T00:00:00.000Z'
} as unknown as InventoryItem

const allDocs: StoredInventoryDoc[] = [room, equipment, container, item]
const byId = new Map(allDocs.map(doc => [doc._id, doc]))
const resolveParent = (id: string) => byId.get(id)

describe('makeSearchSafeId', () => {
  it('replaces illegal characters and stays deterministic', () => {
    const a = makeSearchSafeId('room:1+x')
    const b = makeSearchSafeId('room:1+x')
    expect(a).toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces distinct ids for distinct sources that sanitize alike', () => {
    expect(makeSearchSafeId('a:b')).not.toBe(makeSearchSafeId('a+b'))
  })
})

describe('toInventoryIndexDocument', () => {
  it('maps CouchDB type to search entity kind', () => {
    expect(toInventoryIndexDocument(room, resolveParent)?.kind).toBe('room')
    expect(toInventoryIndexDocument(equipment, resolveParent)?.kind).toBe('equipment')
    expect(toInventoryIndexDocument(container, resolveParent)?.kind).toBe('container')
    expect(toInventoryIndexDocument(item, resolveParent)?.kind).toBe('item')
  })

  it('builds the root-to-leaf location path and room slug', () => {
    const projected = toInventoryIndexDocument(item, resolveParent)!
    expect(projected.locationPath).toEqual(['Freezer Room', 'ULT Freezer A', 'Rack 7'])
    expect(projected.roomSlug).toBe('freezer-room')
    expect(projected.parentSlug).toBe('rack-7')
    expect(projected.parentKind).toBe('container')
  })

  it('extracts project membership from both single and array refs', () => {
    const projected = toInventoryIndexDocument(item, resolveParent)!
    expect(projected.projectIds.sort()).toEqual(['A.Doe_23_01', 'B.Roe_24_02'])
    expect(projected.projectDocIds.sort()).toEqual(['project:abc', 'project:def'])
  })

  it('carries status for items and isActive for rooms/equipment', () => {
    expect(toInventoryIndexDocument(item, resolveParent)?.status).toBe('in_use')
    expect(toInventoryIndexDocument(item, resolveParent)?.isActive).toBeNull()
    expect(toInventoryIndexDocument(room, resolveParent)?.isActive).toBe(true)
    expect(toInventoryIndexDocument(room, resolveParent)?.status).toBeNull()
  })

  it('leaves rooms and equipment with no project membership', () => {
    expect(toInventoryIndexDocument(room, resolveParent)?.projectIds).toEqual([])
    expect(toInventoryIndexDocument(equipment, resolveParent)?.projectIds).toEqual([])
  })

  it('stops traversal gracefully when an ancestor is missing', () => {
    const orphan = { ...container, parent: { db: 'firn', id: 'missing', type: 'container' } } as unknown as Container
    const projected = toInventoryIndexDocument(orphan, id => (id === 'missing' ? undefined : byId.get(id)))!
    expect(projected.locationPath).toEqual([])
    expect(projected.roomSlug).toBeNull()
  })
})

describe('toProjectIndexDocument', () => {
  const projectDoc = {
    _id: 'project:abc',
    project_id: 'A.Doe_23_01',
    project_name: 'Doe Genome',
    application: 'WGS',
    affiliation: 'KI',
    reference_genome: 'hg38',
    contact: 'doe@example.com',
    customer_reference: 'CR-1',
    status_fields: { status: 'Ongoing' },
    details: {
      project_coordinator: 'Coordinator Jo',
      project_comment: 'rush order',
      organism: 'Homo sapiens',
      customer_project_description: 'genomes'
    },
    project_summary: {
      lab_responsible: 'Lab Lee',
      bioinfo_responsible: 'Bio Kim',
      comments: 'all good'
    }
  } as unknown as ProjectsDbDocument

  it('extracts nested and top-level fields', () => {
    const projected = toProjectIndexDocument(projectDoc, 3)
    expect(projected.projectId).toBe('A.Doe_23_01')
    expect(projected.status).toBe('Ongoing')
    expect(projected.organism).toBe('Homo sapiens')
    expect(projected.coordinator).toBe('Coordinator Jo')
    expect(projected.labResponsible).toBe('Lab Lee')
    expect(projected.linkedCount).toBe(3)
  })

  it('concatenates allowlisted comment fields', () => {
    const projected = toProjectIndexDocument(projectDoc, 1)
    expect(projected.comments).toContain('rush order')
    expect(projected.comments).toContain('all good')
  })

  it('returns null comments when none are present', () => {
    const bare = {
      _id: 'project:x', project_id: 'X_1', project_name: 'X', status_fields: { status: 'Closed' }, details: {}
    } as unknown as ProjectsDbDocument
    expect(toProjectIndexDocument(bare, 0).comments).toBeNull()
  })
})

describe('hit converters', () => {
  it('derives the correct detail urls per kind', () => {
    expect(buildInventoryDetailUrl('room', 's')).toBe('/inventory/rooms/s')
    expect(buildInventoryDetailUrl('equipment', 's')).toBe('/inventory/equipment/s/details')
    expect(buildInventoryDetailUrl('container', 's')).toBe('/inventory/containers/s/details')
    expect(buildInventoryDetailUrl('item', 's')).toBe('/inventory/items/s/details')
    expect(buildProjectDetailUrl('A.Doe_23_01')).toBe('/projects/details/A.Doe_23_01')
  })

  it('maps an index document to a client hit with a detail url', () => {
    const hit = toInventoryHit(toInventoryIndexDocument(container, resolveParent)!)
    expect(hit.detailUrl).toBe('/inventory/containers/rack-7/details')
    expect(hit.projectIds).toEqual(['A.Doe_23_01'])
    expect(hit.subtype).toBe('rack')
  })
})
