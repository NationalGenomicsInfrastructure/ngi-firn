/*
 * Inventory Items Router - Table of Contents
 * ******************************************
 *
 * QUERIES (authedProcedure):
 * getItem - Fetch a single item by ID
 * getItemsByParent - List direct child items of a parent
 * getItemsByStatus - Filter items by lifecycle status
 * getExpiringItems - Find items expiring before a date
 * searchItems - Search by id/name/label/description/barcode
 * getItemLocationBreadcrumb - Resolve ancestry path for display
 *
 * QUERIES (tokenProcedure):
 * getItemByToken - Fetch item via tablet/token auth
 * searchItemsByToken - Search items via tablet/token auth (barcode scanning)
 *
 * MUTATIONS (authedProcedure):
 * createItem - Create an item with register action log
 * updateItem - Update item fields (not location)
 * moveItem - Move item to a new parent location
 * checkoutItem - Mark item checked out; create return reminder task
 * returnItem - Return checked-out item to storage
 * reserveItem - Reserve item for upcoming work
 * unreserveItem - Release reservation
 * disposeItem - Permanently dispose item (requires confirm: true)
 * flagItem - Flag item for attention
 *
 * MUTATIONS (tokenProcedure):
 * checkoutItemByToken - Checkout via tablet
 * returnItemByToken - Return via tablet
 *
 * MUTATIONS (adminProcedure):
 * deleteItem - Permanently remove item document
 */

import { createTRPCRouter, authedProcedure, adminProcedure, tokenProcedure } from '../../init'
import { z } from 'zod'
import {
  createItemSchema,
  updateItemSchema,
  deleteItemSchema,
  moveItemSchema,
  checkoutItemSchema,
  returnItemSchema,
  reserveItemSchema,
  unreserveItemSchema,
  disposeItemSchema,
  flagItemSchema,
  searchItemsSchema,
  getItemsByStatusSchema,
  getExpiringItemsSchema
} from '~~/schemas/inventory-items'
import type { InventoryItem, InventoryTask } from '~~/types/inventory'

export const itemsRouter = createTRPCRouter({

  // Queries (authedProcedure)

  getItem: authedProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryItem | null> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getItem(input.itemId)
    }),

  getItemBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryItem | null> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getItemBySlug(input.slug)
    }),

  getItemsByParent: authedProcedure
    .input(z.object({ parentId: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryItem[]> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getItemsByParent(input.parentId)
    }),

  getItemsByStatus: authedProcedure
    .input(getItemsByStatusSchema)
    .query(async ({ input }): Promise<InventoryItem[]> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getItemsByStatus(input.status)
    }),

  getExpiringItems: authedProcedure
    .input(getExpiringItemsSchema)
    .query(async ({ input }): Promise<InventoryItem[]> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getExpiringItems(input.beforeDate)
    }),

  searchItems: authedProcedure
    .input(searchItemsSchema)
    .query(async ({ input }): Promise<InventoryItem[]> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.searchItems(input.query)
    }),

  getItemLocationBreadcrumb: authedProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(async ({ input }): Promise<Array<{ id: string, type: string, name: string }>> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getItemLocationBreadcrumb(input.itemId)
    }),

  // Queries (tokenProcedure — tablet/shared computer access)

  getItemByToken: tokenProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryItem | null> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.getItem(input.itemId)
    }),

  searchItemsByToken: tokenProcedure
    .input(searchItemsSchema)
    .query(async ({ input }): Promise<InventoryItem[]> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.searchItems(input.query)
    }),

  // Mutations (authedProcedure)

  createItem: authedProcedure
    .input(createItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.createItem(input, ctx.secure!.id)
    }),

  updateItem: authedProcedure
    .input(updateItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      const { id, rev } = input
      return ItemService.updateItem(id, rev, input, ctx.secure!.id)
    }),

  moveItem: authedProcedure
    .input(moveItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.moveItem(
        input.itemId,
        input.newParentId,
        input.position ?? null,
        ctx.secure!.id
      )
    }),

  checkoutItem: authedProcedure
    .input(checkoutItemSchema)
    .mutation(async ({ input, ctx }): Promise<{ item: InventoryItem, returnTask: InventoryTask }> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.checkoutItem(input.itemId, ctx.secure!.id)
    }),

  returnItem: authedProcedure
    .input(returnItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.returnItem(
        input.itemId,
        input.parentId,
        input.position ?? null,
        ctx.secure!.id
      )
    }),

  reserveItem: authedProcedure
    .input(reserveItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.reserveItem(input.itemId, ctx.secure!.id, input.description)
    }),

  unreserveItem: authedProcedure
    .input(unreserveItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.unreserveItem(input.itemId, ctx.secure!.id)
    }),

  disposeItem: authedProcedure
    .input(disposeItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.disposeItem(input.itemId, ctx.secure!.id, input.notes)
    }),

  flagItem: authedProcedure
    .input(flagItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.flagItem(input.itemId, ctx.secure!.id, input.description)
    }),

  // Mutations (tokenProcedure — tablet workflows)

  checkoutItemByToken: tokenProcedure
    .input(checkoutItemSchema)
    .mutation(async ({ input, ctx }): Promise<{ item: InventoryItem, returnTask: InventoryTask }> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.checkoutItem(input.itemId, ctx.secure!.id)
    }),

  returnItemByToken: tokenProcedure
    .input(returnItemSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryItem> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      return ItemService.returnItem(
        input.itemId,
        input.parentId,
        input.position ?? null,
        ctx.secure!.id
      )
    }),

  // Mutations (adminProcedure — destructive)

  deleteItem: adminProcedure
    .input(deleteItemSchema)
    .mutation(async ({ input }): Promise<void> => {
      const { ItemService } = await import('../../../crud/inventory-items.server')
      await ItemService.deleteItem(input.id, input.rev)
    })
})
