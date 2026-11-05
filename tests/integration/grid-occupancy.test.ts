/*
 * Integration test for exact grid occupancy and same-parent re-slotting.
 * Runs against the isolated test CouchDB (see tests/setup/integration.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EquipmentService } from '../../server/crud/inventory/equipment.server'
import { ContainerService } from '../../server/crud/inventory/containers.server'
import { ItemService } from '../../server/crud/inventory/items.server'
import { getGridOccupancy } from '../../server/crud/inventory/grid.server'
import type { Container, InventoryItem, StorageEquipment } from '../../types/inventory'
import type { FirnUser } from '../../types/auth'
import { cleanupFixture, setupBaseFixture } from './fixtures'

const createdIds: string[] = []
let user: FirnUser
let equip: StorageEquipment
let rack: Container
let itemGrid: Container
let tube: InventoryItem
let inner: Container

beforeAll(async () => {
  const base = await setupBaseFixture()
  user = base.user
  createdIds.push(...base.createdIds)

  equip = await EquipmentService.createEquipment({
    parentSlug: base.room.slug,
    equipmentType: 'Freezer',
    name: 'GRIDTEST Freezer',
    capacity: [{ type: 'Compartment', capacity: 4 }],
    itemCapacity: [{ category: 'cryovial', capacity: 50 }],
    temperatureCategory: 'deep_freezer'
  })
  createdIds.push(equip._id)

  // Grid of containers (rack) and grid of items (itemGrid).
  rack = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name: 'GRIDTEST Rack',
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'grid', childKind: 'container', type: 'Box', rows: 2, columns: 3, levels: 1 }]
  }, user)
  createdIds.push(rack._id)

  itemGrid = await ContainerService.createContainer({
    containerType: 'Compartment', classification: 'Sample', name: 'GRIDTEST Item Grid',
    parentSlug: equip.slug, parentKind: 'equipment',
    capacity: [{ layout: 'grid', childKind: 'item', type: 'cryovial', rows: 2, columns: 2, levels: 1 }]
  }, user)
  createdIds.push(itemGrid._id)

  inner = await ContainerService.createContainer({
    containerType: 'Box', classification: 'Sample', name: 'GRIDTEST Inner Box',
    parentSlug: rack.slug, parentKind: 'container',
    position: { row: 1, column: 1, level: 1 }
  }, user)
  createdIds.push(inner._id)

  tube = await ItemService.createItem({
    category: 'cryovial', name: 'GRIDTEST Tube', classification: 'Sample',
    parentSlug: itemGrid.slug, parentKind: 'container',
    position: { row: 1, column: 1, level: 1 }
  } as Parameters<typeof ItemService.createItem>[0], user)
  createdIds.push(tube._id)
})

afterAll(async () => {
  await cleanupFixture(createdIds)
})

async function storedCount(slug: string): Promise<number | undefined> {
  const fresh = await ContainerService.getContainerBySlug(slug)
  return fresh?.capacity?.find(entry => entry.layout === 'grid')?.stored
}

describe('getGridOccupancy', () => {
  it('returns the exact occupied cells of a grid in one query', async () => {
    const cells = await getGridOccupancy(rack._id)
    expect(cells).toEqual([{ level: 1, row: 1, column: 1, slug: inner.slug, type: 'container' }])
  })
})

describe('same-parent re-slot', () => {
  it('moves a container to another free cell without changing the stored count', async () => {
    const before = await storedCount(rack.slug)
    await ContainerService.moveContainer({
      containerSlug: [inner.slug], newParentSlug: rack.slug, newParentKind: 'container',
      position: { row: 2, column: 3, level: 1 }
    }, user)
    const cells = await getGridOccupancy(rack._id)
    expect(cells.map(c => [c.row, c.column])).toEqual([[2, 3]])
    expect(await storedCount(rack.slug)).toBe(before)
  })

  it('moves an item to another free cell inside the same grid', async () => {
    const before = await storedCount(itemGrid.slug)
    await ItemService.moveItem({
      itemSlug: [tube.slug], newParentSlug: itemGrid.slug, newParentKind: 'container',
      position: { row: 2, column: 2, level: 1 }
    }, user)
    const cells = await getGridOccupancy(itemGrid._id)
    expect(cells.map(c => [c.row, c.column])).toEqual([[2, 2]])
    expect(await storedCount(itemGrid.slug)).toBe(before)
  })

  it('still rejects a same-parent item move without a new position', async () => {
    await expect(ItemService.moveItem({
      itemSlug: [tube.slug], newParentSlug: itemGrid.slug, newParentKind: 'container'
    }, user)).rejects.toThrow(/already stored/)
  })

  it('rejects dropping onto an occupied cell', async () => {
    const second = await ItemService.createItem({
      category: 'cryovial', name: 'GRIDTEST Tube 2', classification: 'Sample',
      parentSlug: itemGrid.slug, parentKind: 'container',
      position: { row: 1, column: 1, level: 1 }
    } as Parameters<typeof ItemService.createItem>[0], user)
    createdIds.push(second._id)
    await expect(ItemService.moveItem({
      itemSlug: [second.slug], newParentSlug: itemGrid.slug, newParentKind: 'container',
      position: { row: 2, column: 2, level: 1 }
    }, user)).rejects.toThrow()
  })
})
