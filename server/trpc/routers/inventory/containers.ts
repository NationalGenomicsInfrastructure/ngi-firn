/*
 * Inventory Containers Router - Table of Contents
 * *************************************************
 *
 * CONTAINER QUERIES (authedProcedure):
 * getContainerBySlug - Fetch a single container by slug (recent action log, project slug/name hints)
 * getContainersByEquipment - List all containers inside a given piece of storage equipment
 * getContainersByParent - List direct children of a container parent
 * getContainerActionLog - Fetch the full action log for a container (on demand)
 * getContainerProjectRefs - Fetch fully resolved InventoryProjectRef[] for a container (on demand, fetches from projects DB)
 *
 * CONTAINER MUTATIONS (firnUserProcedure):
 * createContainer - Create a new container inside a storage-equipment or container parent
 * updateContainer - Update container metadata
 * moveContainer - Re-home a container to another equipment/container parent
 * alterContainer - Perform lifecycle actions (check-out, return, reserve, discard, dispose, flag)
 * addProjectRef - Link a LIMS project to this container
 * removeProjectRef - Remove a LIMS project link from this container
 *
 * CONTAINER MUTATIONS (adminProcedure):
 * deleteContainer - Delete an empty container, freeing its slot on the parent
 */

import { createTRPCRouter, authedProcedure, adminProcedure, firnUserProcedure } from '../../init'
import { z } from 'zod'
import {
  createContainerSchema,
  updateContainerSchema,
  deleteContainerSchema,
  moveContainerSchema,
  alterContainerSchema
} from '~~/schemas/inventory/container'
import type { DisplayContainer, InventoryActionLogEntry, InventoryProjectRef } from '~~/types/inventory'

/*
 * Resolve the parent document for a single container, then convert to display type.
 * Project associations are extracted from stored slug/name hints — no projects DB fetch.
 * Use getContainerProjectRefs for the full InventoryProjectRef detail.
 */
async function toDisplay(container: import('~~/types/inventory').Container): Promise<DisplayContainer> {
  const { ContainerService } = await import('../../../crud/inventory/containers.server')
  const parent = await ContainerService.resolveParentRef(container.parent)
  return ContainerService.convertToDisplayContainer(container, parent)
}

export const containersRouter = createTRPCRouter({

  // Container queries

  getContainerBySlug: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayContainer | null> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.getContainerBySlug(input.slug)
      return container ? await toDisplay(container) : null
    }),

  getContainersByEquipment: authedProcedure
    .input(z.object({ equipmentSlug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayContainer[]> => {
      const { EquipmentService } = await import('../../../crud/inventory/equipment.server')
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const equipment = await EquipmentService.getEquipmentBySlug(input.equipmentSlug)
      if (!equipment) return []
      const containers = await ContainerService.getContainersByParent(equipment._id, 'equipment')
      return await ContainerService.convertMultipleToDisplayContainers(containers)
    }),

  getContainersByParent: authedProcedure
    .input(z.object({ parentSlug: z.string().min(1) }))
    .query(async ({ input }): Promise<DisplayContainer[]> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const parent = await ContainerService.getContainerBySlug(input.parentSlug)
      if (!parent) return []
      const containers = await ContainerService.getContainersByParent(parent._id, 'container')
      return await ContainerService.convertMultipleToDisplayContainers(containers)
    }),

  getContainerActionLog: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryActionLogEntry[]> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      return await ContainerService.getContainerActionLog(input.slug)
    }),

  getContainerProjectRefs: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryProjectRef[]> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      return await ContainerService.getContainerProjectRefs(input.slug)
    }),

  // Container mutations — firnUserProcedure (user identity recorded in action log)

  createContainer: firnUserProcedure
    .input(createContainerSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayContainer> => {
      if (!ctx.firnUser) throw new Error('User context is required to create a container.')
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.createContainer(input, ctx.firnUser)
      return await toDisplay(container)
    }),

  updateContainer: firnUserProcedure
    .input(updateContainerSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayContainer> => {
      if (!ctx.firnUser) throw new Error('User context is required to update a container.')
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.updateContainer(input, ctx.firnUser)
      return await toDisplay(container)
    }),

  moveContainer: firnUserProcedure
    .input(moveContainerSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayContainer> => {
      if (!ctx.firnUser) throw new Error('User context is required to move a container.')
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.moveContainer(input, ctx.firnUser)
      return await toDisplay(container)
    }),

  alterContainer: firnUserProcedure
    .input(alterContainerSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayContainer[]> => {
      if (!ctx.firnUser) throw new Error('User context is required to alter containers.')
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const containers = await ContainerService.alterContainer(input, ctx.firnUser)
      return await ContainerService.convertMultipleToDisplayContainers(containers)
    }),

  addProjectRef: firnUserProcedure
    .input(z.object({
      containerSlug: z.string().min(1),
      projectId: z.string().min(1, { message: 'LIMS project identifier is required' })
    }))
    .mutation(async ({ input }): Promise<DisplayContainer | null> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.addProjectRef(input.containerSlug, input.projectId)
      return container ? await toDisplay(container) : null
    }),

  removeProjectRef: firnUserProcedure
    .input(z.object({
      containerSlug: z.string().min(1),
      projectId: z.string().min(1, { message: 'LIMS project identifier is required' })
    }))
    .mutation(async ({ input }): Promise<DisplayContainer | null> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.removeProjectRef(input.containerSlug, input.projectId)
      return container ? await toDisplay(container) : null
    }),

  // Container mutations — adminProcedure

  deleteContainer: adminProcedure
    .input(deleteContainerSchema)
    .mutation(async ({ input }): Promise<DisplayContainer> => {
      const { ContainerService } = await import('../../../crud/inventory/containers.server')
      const container = await ContainerService.deleteContainer(input)
      return await toDisplay(container)
    })

})
