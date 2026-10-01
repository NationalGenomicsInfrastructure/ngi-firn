/*
 * Inventory Project Links Router - Table of Contents
 * **************************************************
 *
 * QUERIES (authedProcedure):
 * getInventoryByProject - Containers and items linked to a project
 *
 * MUTATIONS (firnUserProcedure):
 * linkEntities / unlinkEntities - Best-effort batch (un)link of items and containers
 */

import { z } from 'zod'
import { createTRPCRouter, authedProcedure, firnUserProcedure } from '../../init'
import { projectLinkBatchSchema } from '~~/schemas/inventory/projectLinks'
import type { ProjectLinkResult } from '~~/schemas/inventory/projectLinks'
import type { DisplayContainer, DisplayInventoryItem } from '~~/types/inventory'

export const projectLinksRouter = createTRPCRouter({
  getInventoryByProject: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input }): Promise<{ containers: DisplayContainer[], items: DisplayInventoryItem[] }> => {
      const { ProjectLinkService } = await import('../../../crud/inventory/projectLinks.server')
      return await ProjectLinkService.getInventoryByProject(input.projectId)
    }),

  linkEntities: firnUserProcedure
    .input(projectLinkBatchSchema)
    .mutation(async ({ input }): Promise<ProjectLinkResult> => {
      const { ProjectLinkService } = await import('../../../crud/inventory/projectLinks.server')
      return await ProjectLinkService.linkEntities(input.projectId, input.entities)
    }),

  unlinkEntities: firnUserProcedure
    .input(projectLinkBatchSchema)
    .mutation(async ({ input }): Promise<ProjectLinkResult> => {
      const { ProjectLinkService } = await import('../../../crud/inventory/projectLinks.server')
      return await ProjectLinkService.unlinkEntities(input.projectId, input.entities)
    })
})
