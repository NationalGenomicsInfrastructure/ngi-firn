/*
 * Inventory Search Router - Table of Contents
 * *******************************************
 *
 * SEARCH QUERIES (authedProcedure):
 * search - Run the global inventory + project-link search, returning both grouped sections
 * projectGroupInventory - Fetch one project group's next linked-inventory page (expand/load more)
 * status - Report the search index freshness/availability (drives the UI's index-state banner)
 *
 * ADMIN MUTATIONS (adminProcedure):
 * rebuild - Trigger a detached full rebuild of both indexes (admin search maintenance page)
 *
 * The heavy lifting lives in the server/search module; these procedures only validate input and
 * delegate. They are authenticated (any logged-in user may search) and always await the service
 * so tRPC resolves with the real result.
 */

import { createTRPCRouter, authedProcedure, adminProcedure } from '../../init'
import {
  inventorySearchInputSchema,
  projectGroupInventoryInputSchema
} from '~~/schemas/inventory/search'
import type { InventorySearchResponse, SearchIndexStatus, SearchInventoryPage, SearchRebuildResult } from '~~/types/search'

export const searchRouter = createTRPCRouter({
  search: authedProcedure
    .input(inventorySearchInputSchema)
    .query(async ({ input }): Promise<InventorySearchResponse> => {
      const { SearchService } = await import('../../../search/service')
      return await SearchService.searchInventory(input)
    }),

  projectGroupInventory: authedProcedure
    .input(projectGroupInventoryInputSchema)
    .query(async ({ input }): Promise<SearchInventoryPage> => {
      const { SearchService } = await import('../../../search/service')
      return await SearchService.getProjectGroupInventory(input)
    }),

  status: authedProcedure
    .query(async (): Promise<SearchIndexStatus> => {
      const { SearchService } = await import('../../../search/service')
      return SearchService.getStatus()
    }),

  rebuild: adminProcedure
    .mutation(async (): Promise<SearchRebuildResult> => {
      const { SearchService } = await import('../../../search/service')
      return await SearchService.requestRebuild()
    })
})
