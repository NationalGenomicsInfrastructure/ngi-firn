/*
 * Inventory Items Router - Table of Contents
 * ********************************************
 *
 * ITEM QUERIES (authedProcedure):
 * getItemBySlug - Fetch one item by slug
 * getItemsByEquipment - List direct item children of equipment
 * getItemsByParent - List direct item children of a container
 * getAllItems - List all items
 * getAcceptedItemCapacity - List item capacity categories accepted by a parent
 * getMoveTargets / getMoveTargetsForItems - List valid single/batch destinations
 * getItemActionLog - Fetch complete action history
 * getItemProjectRefs - Fetch resolved project details
 *
 * ITEM MUTATIONS (firnUserProcedure):
 * createItem, updateItem, moveItem, locateItem, alterItem
 * addProjectRef, removeProjectRef
 *
 * ITEM MUTATIONS (adminProcedure):
 * deleteItem - Best-effort batch deletion
 */

import { z } from 'zod'
import { createTRPCRouter, adminProcedure, authedProcedure, firnUserProcedure } from '../../init'
import {
  alterItemSchema,
  createItemSchema,
  deleteItemSchema,
  itemMoveTargetsBatchSchema,
  itemMoveTargetsSchema,
  locateItemSchema,
  moveItemSchema,
  updateItemSchema
} from '~~/schemas/inventory/items'
import { acceptedChildrenSchema } from '~~/schemas/inventory/container'
import type {
  AcceptedChildCapacity,
  DisplayInventoryActionLogEntry,
  DisplayInventoryItem,
  InventoryProjectRef,
  ItemMoveTarget
} from '~~/types/inventory'

/* Convert a stored item to its client-safe projection through the batch-aware service helper. */
async function toDisplay(item: import('~~/types/inventory').InventoryItem): Promise<DisplayInventoryItem> {
  const { ItemService } = await import('../../../crud/inventory/items.server')
  const [display] = await ItemService.convertMultipleToDisplayItems([item])
  if (!display) {
    throw new Error(`Failed to convert item "${item.slug}" for display.`)
  }
  return display
}

export const itemsRouter = createTRPCRouter({

  // Item queries

  getItemBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayInventoryItem | null> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      const item = await ItemService.getItemBySlug(input.slug)
      return item ? await toDisplay(item) : null
    }),

  getItemsByEquipment: authedProcedure
    .input(z.object({ equipmentSlug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayInventoryItem[]> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      const equipment = await EquipmentService.getEquipmentBySlug(input.equipmentSlug)
      if (!equipment) return []
      return await ItemService.convertMultipleToDisplayItems(
        await ItemService.getItemsByParent(equipment._id, 'equipment')
      )
    }),

  getItemsByParent: authedProcedure
    .input(z.object({ parentSlug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayInventoryItem[]> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      const parent = await ContainerService.getContainerBySlug(input.parentSlug)
      if (!parent) return []
      return await ItemService.convertMultipleToDisplayItems(
        await ItemService.getItemsByParent(parent._id, 'container')
      )
    }),

  getAllItems: authedProcedure
    .query(async (): Promise<DisplayInventoryItem[]> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.convertMultipleToDisplayItems(await ItemService.getAllItems())
    }),

  getAcceptedItemCapacity: authedProcedure
    .input(acceptedChildrenSchema)
    .query(async ({ input }): Promise<AcceptedChildCapacity[]> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const capacities = await ContainerService.getAcceptedChildCapacity(input.parentSlug, input.parentKind)
      return capacities.filter(capacity => capacity.childKind === 'item')
    }),

  getMoveTargets: authedProcedure
    .input(itemMoveTargetsSchema)
    .query(async ({ input }): Promise<ItemMoveTarget[]> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.getMoveTargetsForItem(input.itemSlug)
    }),

  getMoveTargetsForItems: authedProcedure
    .input(itemMoveTargetsBatchSchema)
    .query(async ({ input }): Promise<ItemMoveTarget[]> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.getMoveTargetsForItems(input.itemSlug)
    }),

  getItemActionLog: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayInventoryActionLogEntry[]> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.getItemActionLog(input.slug)
    }),

  getItemProjectRefs: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryProjectRef[]> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.getItemProjectRefs(input.slug)
    }),

  // Item mutations — firnUserProcedure (user identity recorded in action log)

  createItem: firnUserProcedure
    .input(createItemSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayInventoryItem> => {
      if (!ctx.firnUser) throw new Error('User context is required to create an item.')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await toDisplay(await ItemService.createItem(input, ctx.firnUser))
    }),

  updateItem: firnUserProcedure
    .input(updateItemSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayInventoryItem> => {
      if (!ctx.firnUser) throw new Error('User context is required to update an item.')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await toDisplay(await ItemService.updateItem(input, ctx.firnUser))
    }),

  moveItem: firnUserProcedure
    .input(moveItemSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayInventoryItem[]> => {
      if (!ctx.firnUser) throw new Error('User context is required to move items.')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.convertMultipleToDisplayItems(await ItemService.moveItem(input, ctx.firnUser))
    }),

  locateItem: firnUserProcedure
    .input(locateItemSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayInventoryItem[]> => {
      if (!ctx.firnUser) throw new Error('User context is required to locate items.')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.convertMultipleToDisplayItems(await ItemService.locateItem(input, ctx.firnUser))
    }),

  alterItem: firnUserProcedure
    .input(alterItemSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayInventoryItem[]> => {
      if (!ctx.firnUser) throw new Error('User context is required to alter items.')
      const { ItemService } = await import('../../../crud/inventory/items.server')
      return await ItemService.convertMultipleToDisplayItems(await ItemService.alterItem(input, ctx.firnUser))
    }),

  addProjectRef: firnUserProcedure
    .input(z.object({
      itemSlug: z.string().min(1),
      projectId: z.string().min(1, { message: 'LIMS project identifier is required' })
    }))
    .mutation(async ({ input }): Promise<DisplayInventoryItem | null> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      const item = await ItemService.addProjectRef(input.itemSlug, input.projectId)
      return item ? await toDisplay(item) : null
    }),

  removeProjectRef: firnUserProcedure
    .input(z.object({
      itemSlug: z.string().min(1),
      projectId: z.string().min(1, { message: 'LIMS project identifier is required' })
    }))
    .mutation(async ({ input }): Promise<DisplayInventoryItem | null> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      const item = await ItemService.removeProjectRef(input.itemSlug, input.projectId)
      return item ? await toDisplay(item) : null
    }),

  // Item mutations — adminProcedure

  deleteItem: adminProcedure
    .input(deleteItemSchema)
    .mutation(async ({ input }): Promise<{ deleted: DisplayInventoryItem[], failures: { slug: string, error: string }[] }> => {
      const { ItemService } = await import('../../../crud/inventory/items.server')
      const { deleted, failures } = await ItemService.deleteItem(input)
      return {
        deleted: await ItemService.convertMultipleToDisplayItems(deleted),
        failures
      }
    })
})
