/*
 * Inventory Containers Router - Table of Contents
 * ***********************************************
 *
 * QUERIES (authedProcedure):
 * getContainer - Fetch a single container by ID
 * getContainersByParent - List direct child containers of a parent
 * getContainerContents - List child containers and items of a container
 * getDescendants - Return all descendants recursively
 * suggestLocations - Find containers with free capacity for a given category/count
 * getByProject - Reverse lookup: all containers/items linked to a project
 *
 * MUTATIONS (authedProcedure):
 * createContainer - Create a container under a valid parent
 * updateContainer - Update container fields (not location)
 * moveContainer - Move container to a new parent with cascade
 *
 * MUTATIONS (adminProcedure):
 * deleteContainer - Delete an empty container (cascading risk)
 */

import { createTRPCRouter, authedProcedure, adminProcedure } from '../../init'
import { z } from 'zod'
import {
  createContainerSchema,
  updateContainerSchema,
  deleteContainerSchema,
  moveContainerSchema,
  suggestLocationsSchema,
  getByProjectSchema
} from '~~/schemas/inventory-containers'
import type { Container, InventoryItem, SuggestedLocation } from '~~/types/inventory'

export const containersRouter = createTRPCRouter({

  // Queries

  getContainer: authedProcedure
    .input(z.object({ containerId: z.string().min(1) }))
    .query(async ({ input }): Promise<Container | null> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.getContainer(input.containerId)
    }),

  getContainersByParent: authedProcedure
    .input(z.object({ parentId: z.string().min(1) }))
    .query(async ({ input }): Promise<Container[]> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.getContainersByParent(input.parentId)
    }),

  getContainerContents: authedProcedure
    .input(z.object({ containerId: z.string().min(1) }))
    .query(async ({ input }): Promise<{ containers: Container[], items: InventoryItem[] }> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.getContainerContents(input.containerId)
    }),

  getDescendants: authedProcedure
    .input(z.object({ containerId: z.string().min(1) }))
    .query(async ({ input }): Promise<(Container | InventoryItem)[]> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.getDescendants(input.containerId)
    }),

  suggestLocations: authedProcedure
    .input(suggestLocationsSchema)
    .query(async ({ input }): Promise<SuggestedLocation[]> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.suggestLocations(input)
    }),

  getByProject: authedProcedure
    .input(getByProjectSchema)
    .query(async ({ input }): Promise<(Container | InventoryItem)[]> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.getByProject(input.projectId, input.db)
    }),

  // Mutations

  createContainer: authedProcedure
    .input(createContainerSchema)
    .mutation(async ({ input, ctx }): Promise<Container> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.createContainer(input, ctx.secure!.id)
    }),

  updateContainer: authedProcedure
    .input(updateContainerSchema)
    .mutation(async ({ input, ctx }): Promise<Container> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      const { id, rev } = input
      return ContainerService.updateContainer(id, rev, input, ctx.secure!.id)
    }),

  moveContainer: authedProcedure
    .input(moveContainerSchema)
    .mutation(async ({ input, ctx }): Promise<Container> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.moveContainer(
        input.containerId,
        input.newParentId,
        input.newParentType,
        input.position ?? null,
        ctx.secure!.id
      )
    }),

  deleteContainer: adminProcedure
    .input(deleteContainerSchema)
    .mutation(async ({ input }): Promise<void> => {
      const { ContainerService } = await import('../../../crud/inventory-containers.server')
      return ContainerService.deleteContainer(input.id, input.rev)
    })
})
