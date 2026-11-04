/*
 * Read-side search service: turns a validated search request into bounded Meilisearch queries and
 * assembles the grouped, independently-paginated response.
 *
 * Meilisearch has no relational joins, so the two result sections are produced with separate
 * queries:
 *  - Project section: a text query against the project index; for each matching project a bounded
 *    "match-all" query against the inventory index filtered to that project's membership yields its
 *    linked inventory (regardless of whether the item text matched).
 *  - Direct section: a text query against the inventory index; the project ids carried on the hits
 *    are resolved to names via one bounded project-index lookup so the client can group the page.
 *
 * When the engine is unconfigured, still bootstrapping, or unavailable, the service returns empty
 * sections together with an honest `freshness` status rather than throwing — the UI renders that
 * state explicitly instead of a misleading "no results".
 */

import type {
  InventoryIndexDocument,
  InventorySearchResponse,
  ProjectIndexDocument,
  SearchInventoryPage,
  SearchProjectGroup,
  SearchRebuildResult
} from '../../types/search'
import type { Index } from 'meilisearch'
import type { InventorySearchInput, ProjectGroupInventoryInput } from '../../schemas/inventory/search'
import { getSearchClient } from './client'
import { inventoryIndexName, isSearchConfigured, projectIndexName } from './config'
import { toInventoryHit, toProjectHit } from './projections'
import { getSearchState, isRebuilding } from './state'

/* Escape a value for use inside a double-quoted Meilisearch filter literal. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function inClause(field: string, values: string[]): string {
  return `${field} IN [${values.map(quote).join(', ')}]`
}

/* Build the AND-combined inventory filter from the common filter inputs. */
function buildInventoryFilter(parts: {
  kinds?: string[]
  statuses?: string[]
  roomSlug?: string
  projectId?: string
}): string[] {
  const filters: string[] = []
  if (parts.kinds && parts.kinds.length > 0) {
    filters.push(inClause('kind', parts.kinds))
  }
  if (parts.statuses && parts.statuses.length > 0) {
    filters.push(inClause('status', parts.statuses))
  }
  if (parts.roomSlug) {
    filters.push(`roomSlug = ${quote(parts.roomSlug)}`)
  }
  if (parts.projectId) {
    filters.push(`projectIds = ${quote(parts.projectId)}`)
  }
  return filters
}

interface RawSearchResult<T> {
  hits: T[]
  total: number
  totalIsEstimated: boolean
}

function readTotals<T>(res: { hits: T[], estimatedTotalHits?: number, totalHits?: number }): RawSearchResult<T> {
  const estimated = res.estimatedTotalHits
  const total = estimated ?? res.totalHits ?? res.hits.length
  return { hits: res.hits, total, totalIsEstimated: estimated !== undefined }
}

function toInventoryPage(raw: RawSearchResult<InventoryIndexDocument>, offset: number, limit: number): SearchInventoryPage {
  const hits = raw.hits.map(toInventoryHit)
  return {
    hits,
    total: raw.total,
    totalIsEstimated: raw.totalIsEstimated,
    offset,
    limit,
    hasMore: offset + hits.length < raw.total
  }
}

function emptyPage(offset: number, limit: number): SearchInventoryPage {
  return { hits: [], total: 0, totalIsEstimated: false, offset, limit, hasMore: false }
}

/* Response returned when the engine cannot serve the request. */
function unavailableResponse(query: string, input: InventorySearchInput): InventorySearchResponse {
  return {
    query,
    projectGroups: { groups: [], total: 0, offset: input.projectOffset, limit: input.projectLimit, hasMore: false },
    directMatches: emptyPage(input.inventoryOffset, input.inventoryLimit),
    projectLookup: {},
    freshness: getSearchState()
  }
}

function isServable(): boolean {
  if (!isSearchConfigured()) {
    return false
  }
  const phase = getSearchState().phase
  return phase === 'ready' || phase === 'stale'
}

export const SearchService = {
  async searchInventory(input: InventorySearchInput): Promise<InventorySearchResponse> {
    const client = getSearchClient()
    if (!client || !isServable()) {
      return unavailableResponse(input.query, input)
    }

    const inventoryIdx = client.index<InventoryIndexDocument>(inventoryIndexName())
    const projectIdx = client.index<ProjectIndexDocument>(projectIndexName())
    const state = getSearchState()

    const commonFilters = {
      kinds: input.kinds,
      statuses: input.statuses,
      roomSlug: input.roomSlug,
      projectId: input.projectId
    }

    /* --- Project section (only when the projects index is live) --- */
    const groups: SearchProjectGroup[] = []
    let projectTotal = 0

    if (state.projectsReady) {
      const projectFilter: string[] = []
      if (input.projectId) {
        projectFilter.push(`projectId = ${quote(input.projectId)}`)
      }
      const projectRes = readTotals(await projectIdx.search(input.query, {
        offset: input.projectOffset,
        limit: input.projectLimit,
        filter: projectFilter
      }))
      projectTotal = projectRes.total

      for (const projectDoc of projectRes.hits) {
        const inventoryFilter = buildInventoryFilter({
          kinds: input.kinds,
          statuses: input.statuses,
          roomSlug: input.roomSlug,
          projectId: projectDoc.projectId
        })
        const linkedRes = readTotals(await inventoryIdx.search('', {
          filter: inventoryFilter,
          sort: ['updatedAtTs:desc'],
          offset: 0,
          limit: input.projectInventoryLimit
        }))
        groups.push({
          project: toProjectHit(projectDoc),
          inventory: toInventoryPage(linkedRes, 0, input.projectInventoryLimit)
        })
      }
    }

    /* --- Direct inventory matches section --- */
    const directRes = readTotals(await inventoryIdx.search(input.query, {
      filter: buildInventoryFilter(commonFilters),
      offset: input.inventoryOffset,
      limit: input.inventoryLimit
    }))
    const directPage = toInventoryPage(directRes, input.inventoryOffset, input.inventoryLimit)

    /* --- Resolve project names for the direct hits so the client can group the page --- */
    const projectLookup = state.projectsReady
      ? await this.resolveProjectLookup(projectIdx, directRes.hits)
      : {}

    return {
      query: input.query,
      projectGroups: {
        groups,
        total: projectTotal,
        offset: input.projectOffset,
        limit: input.projectLimit,
        hasMore: input.projectOffset + groups.length < projectTotal
      },
      directMatches: directPage,
      projectLookup,
      freshness: state
    }
  },

  /* Bounded project-index lookup resolving the distinct project ids on a set of inventory hits. */
  async resolveProjectLookup(
    projectIdx: Index<ProjectIndexDocument>,
    hits: InventoryIndexDocument[]
  ): Promise<Record<string, { projectName: string, detailUrl: string }>> {
    const ids = [...new Set(hits.flatMap(hit => hit.projectIds))]
    if (ids.length === 0) {
      return {}
    }
    const res = await projectIdx.search('', {
      filter: [inClause('projectId', ids)],
      limit: ids.length
    })
    const lookup: Record<string, { projectName: string, detailUrl: string }> = {}
    for (const doc of res.hits) {
      const hit = toProjectHit(doc)
      lookup[hit.projectId] = { projectName: hit.projectName, detailUrl: hit.detailUrl }
    }
    return lookup
  },

  /* Fetch one project group's next inventory page (expand / load-more within a group). */
  async getProjectGroupInventory(input: ProjectGroupInventoryInput): Promise<SearchInventoryPage> {
    const client = getSearchClient()
    if (!client || !isServable()) {
      return emptyPage(input.offset, input.limit)
    }
    const inventoryIdx = client.index<InventoryIndexDocument>(inventoryIndexName())
    const res = readTotals(await inventoryIdx.search('', {
      filter: buildInventoryFilter({
        kinds: input.kinds,
        statuses: input.statuses,
        roomSlug: input.roomSlug,
        projectId: input.projectId
      }),
      sort: ['updatedAtTs:desc'],
      offset: input.offset,
      limit: input.limit
    }))
    return toInventoryPage(res, input.offset, input.limit)
  },

  getStatus() {
    return getSearchState()
  },

  /*
   * Admin-triggered full rebuild. Fire-and-forget: a rebuild over the whole inventory can take a
   * while, so we never await it inside the request. `rebuildAll` owns the re-entrancy guard, so a
   * concurrent scheduled rebuild (or a second click) is reported as `already-running` here and
   * safely no-ops there.
   */
  async requestRebuild(): Promise<SearchRebuildResult> {
    if (!isSearchConfigured()) {
      return { status: 'unavailable', freshness: getSearchState() }
    }
    if (isRebuilding()) {
      return { status: 'already-running', freshness: getSearchState() }
    }
    const { rebuildAll } = await import('./indexer')
    void rebuildAll()
    return { status: 'accepted', freshness: getSearchState() }
  }
}
