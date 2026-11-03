import { z } from 'zod'
import { inventoryStatusSchema } from './metadata'

/*
 * Input validation for the global inventory search procedure.
 *
 * The search is read-only and authenticated. These bounds protect the engine from abusive
 * requests: the query is length-capped, entity kinds and statuses are closed enums (so the
 * server can build Meilisearch filter expressions without ever interpolating raw client text),
 * and every pagination window is bounded. Each result section paginates independently, so the
 * input carries separate offsets/limits for project groups, per-group inventory and direct
 * inventory matches.
 */

export const searchEntityKindSchema = z.enum(['room', 'equipment', 'container', 'item'])

const MAX_QUERY_LENGTH = 200

export const inventorySearchInputSchema = z.object({
  /* Free-text query. Trimmed; an empty query is rejected by the caller (guidance is shown). */
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  /* Restrict to these entity kinds. Empty array means "all kinds". */
  kinds: z.array(searchEntityKindSchema).max(4).default([]),
  /* Restrict container/item lifecycle status. Empty array means "all statuses". */
  statuses: z.array(inventoryStatusSchema).max(6).default([]),
  /* Optional location filter by room slug. */
  roomSlug: z.string().trim().min(1).max(200).optional(),
  /* Optional filter to a single linked project (LIMS project id). */
  projectId: z.string().trim().min(1).max(200).optional(),
  /* Pagination for the matching-projects section. */
  projectOffset: z.number().int().min(0).max(10000).default(0),
  projectLimit: z.number().int().min(1).max(20).default(5),
  /* Per-project inventory window used when rendering/expanding a project group. */
  projectInventoryLimit: z.number().int().min(1).max(50).default(10),
  /* Pagination for the direct inventory matches section. */
  inventoryOffset: z.number().int().min(0).max(10000).default(0),
  inventoryLimit: z.number().int().min(1).max(50).default(20)
})

export type InventorySearchInput = z.infer<typeof inventorySearchInputSchema>

/*
 * Input for fetching a single project group's next inventory page without re-running the whole
 * search (used when the user expands/pages one project's linked inventory).
 */
export const projectGroupInventoryInputSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  kinds: z.array(searchEntityKindSchema).max(4).default([]),
  statuses: z.array(inventoryStatusSchema).max(6).default([]),
  roomSlug: z.string().trim().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(50).default(10)
})

export type ProjectGroupInventoryInput = z.infer<typeof projectGroupInventoryInputSchema>
