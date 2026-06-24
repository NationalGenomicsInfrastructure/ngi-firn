/*
 * ProjectService - read-only access to the external 'projects' database
 * *********************************************************************
 *
 * AVAILABILITY:
 * isProjectsAvailable() - Whether the projects database exists and is reachable
 *
 * READ:
 * getProjectByProjectId(projectId) - Fetch a single project by project_id (uses project_id view)
 * listProjectsSummary(options) - List/search via summary view, top-level fields only (lean)
 * listProjectsSummaryWithDetails(options) - Same as above with full view value (details, order_details, etc.)
 */

import 'dotenv/config'
import { couchDB } from '../database/couchdb'
import type {
  Project,
  ProjectsDbDocument,
  SummaryViewKey,
  SummaryViewValue
} from '../../types/projects'

export const PROJECTS_DB_NAME = process.env.CLOUDANT_PROJECTS_DATABASE || 'projects'
const MAX_PAGE_SIZE = 200
const PROJECT_DESIGN_DOC = 'project'

/**
 * Number of summary view rows scanned per status when a project_name/application filter is active.
 * The summary view is keyed by [status, project_id], so these substring filters cannot be pushed
 * into CouchDB and must be applied in memory. The scan runs newest project_id first (descending),
 * so recent projects surface within the window; when the scan fills it, results expose
 * `scan_truncated: true` so callers know more (older) matches may exist beyond the window.
 *
 * The default is deliberately low so the first filtered query stays cheap. Callers may pass a larger
 * `scan_limit` (e.g. a "Retrieve more" action) to scan deeper, clamped to MAX_FILTER_SCAN_LIMIT.
 * When the requested scan reaches the ceiling, results expose `scan_at_max: true`.
 */
const DEFAULT_FILTER_SCAN_LIMIT = 300
const MAX_FILTER_SCAN_LIMIT = 5000

const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)

/**
 * Resolve the per-request scan window: the caller's requested `scan_limit` (or the default),
 * never below the page `limit` (so a full page can be filled) and never above the hard ceiling.
 */
function resolveScanLimit(requested: number | undefined, pageLimit: number): number {
  return Math.min(Math.max(requested ?? DEFAULT_FILTER_SCAN_LIMIT, pageLimit), MAX_FILTER_SCAN_LIMIT)
}

/**
 * In-memory predicate for the summary view value. Both filters are case-insensitive substring
 * matches; pass the filter terms already trimmed and lower-cased.
 */
function matchesSummaryFilters(
  value: SummaryViewValue,
  nameFilter?: string,
  applicationFilter?: string
): boolean {
  if (nameFilter && (value.project_name ?? '').toLowerCase().indexOf(nameFilter) < 0)
    return false
  if (applicationFilter && (value.application ?? '').toLowerCase().indexOf(applicationFilter) < 0)
    return false
  return true
}

/** DTO for list/search: fields needed to display and filter by project_name, project_id, application. */
export interface ProjectSummaryListItem {
  project_id: string
  project_name?: string
  application?: string | null
  open_date?: string
  close_date?: string
  status?: string
  no_samples?: number
  affiliation?: string
  contact?: string
  priority?: string | null
  modification_time?: string
  [key: string]: unknown
}

/** Summary row with full view value (details, project_summary, order_details, etc.) for bookmarked subset use. */
export type ProjectSummaryWithDetailsItem = SummaryViewValue & { project_id: string, status?: string }

export const ProjectService = {
  /**
   * Check whether the projects database exists and is reachable.
   * Safe to call anytime; returns false on 404 or connection errors without throwing.
   * Use this to decide whether to show "populate from projects" functionality.
   */
  async isProjectsAvailable(): Promise<boolean> {
    try {
      const info = await projectsDB.getDatabaseInformation()
      return info !== null
    }
    catch {
      return false
    }
  },

  /**
   * Get a single project document by project_id using the project_id view.
   * Returns null if not found or on error (e.g. database or view unavailable).
   */
  async getProjectByProjectId(projectId: string): Promise<Project | null> {
    try {
      const result = await projectsDB.queryView<string, string, ProjectsDbDocument>(
        PROJECT_DESIGN_DOC,
        'project_id',
        { key: projectId, include_docs: true }
      )
      const row = result.rows[0]
      return (row?.doc as Project) ?? null
    }
    catch {
      return null
    }
  },

  /**
   * List/search projects using the summary view. Key is [status, project_id].
   * When status is omitted ("Any"), runs two queries (open + closed) and merges results ordered by modification_time desc.
   * Optionally filter in-memory by project_name or application when view does not index them.
   *
   * NOTE on `total_rows`: without filters it is the view's own row count; with a name/application
   * filter active it is the number of matches found within the scanned window (and `scan_truncated`
   * is true when that scan filled the window, i.e. more matches may exist beyond it). Pass a larger
   * `scan_limit` to scan deeper; `scan_at_max` is true once the scan reaches MAX_FILTER_SCAN_LIMIT.
   */
  async listProjectsSummary(options?: {
    status?: 'open' | 'closed'
    ngi_project_id?: string
    project_name_filter?: string
    application_filter?: string
    scan_limit?: number
    limit?: number
    skip?: number
  }): Promise<{ items: ProjectSummaryListItem[], total_rows?: number, offset?: number, scan_truncated?: boolean, scan_at_max?: boolean }> {
    try {
      const status = options?.status
      const limit = Math.min(options?.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
      const skip = options?.skip ?? 0
      const prefix = options?.ngi_project_id ?? ''
      const hasFilters = !!(options?.project_name_filter?.trim() || options?.application_filter?.trim())
      const project_name_filter = options?.project_name_filter?.trim().toLowerCase()
      const application_filter = options?.application_filter?.trim().toLowerCase()
      const scanLimit = resolveScanLimit(options?.scan_limit, limit)
      const scan_at_max = scanLimit >= MAX_FILTER_SCAN_LIMIT

      const mapRowToItem = (row: { key: SummaryViewKey, value: SummaryViewValue }): ProjectSummaryListItem => {
        const v = row.value
        const [statusPart, project_id] = Array.isArray(row.key) ? row.key : [undefined, undefined]
        return {
          project_id: v.project_id ?? (project_id as string) ?? '',
          project_name: v.project_name,
          application: v.application,
          open_date: v.open_date,
          close_date: v.close_date,
          status: statusPart as string,
          no_samples: v.no_samples,
          affiliation: v.affiliation,
          contact: v.contact,
          priority: v.priority ?? undefined,
          modification_time: v.modification_time
        }
      }

      if (status) {
        // Single status: one query
        const fetchLimit = hasFilters ? scanLimit : limit
        const result = await projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
          PROJECT_DESIGN_DOC,
          'summary',
          {
            // Scan newest project_id first so recent projects surface within the scan window.
            startkey: [status, prefix + '\uffff'] as SummaryViewKey,
            endkey: [status, prefix] as SummaryViewKey,
            descending: true,
            limit: fetchLimit,
            skip,
            include_docs: false
          }
        )
        let rows = result.rows
        let total_rows = result.total_rows
        let scan_truncated = false
        if (hasFilters) {
          rows = rows.filter(r => matchesSummaryFilters(r.value, project_name_filter, application_filter))
          // With filters the view total is meaningless; report matches found within the scanned window.
          total_rows = rows.length
          scan_truncated = result.rows.length >= fetchLimit
        }
        const limited = rows.slice(0, limit)
        return {
          items: limited.map(mapRowToItem),
          total_rows,
          offset: result.offset,
          scan_truncated,
          scan_at_max: scan_truncated ? scan_at_max : undefined
        }
      }

      // "Any" status: two queries (open + closed), merge and sort by modification_time desc
      const fetchLimit = hasFilters ? scanLimit : skip + limit
      const [openResult, closedResult] = await Promise.all([
        projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
          PROJECT_DESIGN_DOC,
          'summary',
          {
            // Scan newest project_id first so recent projects surface within the scan window.
            startkey: ['open', prefix + '\uffff'] as SummaryViewKey,
            endkey: ['open', prefix] as SummaryViewKey,
            descending: true,
            limit: fetchLimit,
            skip: 0,
            include_docs: false
          }
        ),
        projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
          PROJECT_DESIGN_DOC,
          'summary',
          {
            // Scan newest project_id first so recent projects surface within the scan window.
            startkey: ['closed', prefix + '\uffff'] as SummaryViewKey,
            endkey: ['closed', prefix] as SummaryViewKey,
            descending: true,
            limit: fetchLimit,
            skip: 0,
            include_docs: false
          }
        )
      ])

      const merged = [...openResult.rows, ...closedResult.rows].sort((a, b) => {
        const ma = a.value.modification_time ?? ''
        const mb = b.value.modification_time ?? ''
        return mb.localeCompare(ma)
      })

      let rows = merged
      let total_rows = (openResult.total_rows ?? 0) + (closedResult.total_rows ?? 0)
      let scan_truncated = false
      if (hasFilters) {
        rows = rows.filter(r => matchesSummaryFilters(r.value, project_name_filter, application_filter))
        // With filters the view totals are meaningless; report matches found within the scanned window.
        total_rows = rows.length
        scan_truncated = openResult.rows.length >= fetchLimit || closedResult.rows.length >= fetchLimit
      }
      const paged = rows.slice(skip, skip + limit)

      return {
        items: paged.map(mapRowToItem),
        total_rows,
        offset: skip,
        scan_truncated,
        scan_at_max: scan_truncated ? scan_at_max : undefined
      }
    }
    catch {
      return { items: [], total_rows: undefined, offset: undefined }
    }
  },

  /**
   * List/search projects with full summary view value (details, project_summary, order_details, etc.).
   * Same filters as listProjectsSummary; when status is omitted ("Any"), runs two queries and merges by modification_time desc.
   * `total_rows` / `scan_truncated` follow the same semantics as listProjectsSummary.
   */
  async listProjectsSummaryWithDetails(options?: {
    status?: 'open' | 'closed'
    ngi_project_id?: string
    project_name_filter?: string
    application_filter?: string
    scan_limit?: number
    limit?: number
    skip?: number
  }): Promise<{ items: ProjectSummaryWithDetailsItem[], total_rows?: number, offset?: number, scan_truncated?: boolean, scan_at_max?: boolean }> {
    try {
      const status = options?.status
      const limit = Math.min(options?.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
      const skip = options?.skip ?? 0
      const prefix = options?.ngi_project_id ?? ''
      const hasFilters = !!(options?.project_name_filter?.trim() || options?.application_filter?.trim())
      const project_name_filter = options?.project_name_filter?.trim().toLowerCase()
      const application_filter = options?.application_filter?.trim().toLowerCase()
      const scanLimit = resolveScanLimit(options?.scan_limit, limit)
      const scan_at_max = scanLimit >= MAX_FILTER_SCAN_LIMIT

      const mapRowToDetailsItem = (row: { key: SummaryViewKey, value: SummaryViewValue }): ProjectSummaryWithDetailsItem => {
        const v = row.value
        const [statusPart, project_id] = Array.isArray(row.key) ? row.key : [undefined, undefined]
        return {
          project_id: v.project_id ?? (project_id as string) ?? '',
          status: statusPart as string,
          ...v
        }
      }

      if (status) {
        const fetchLimit = hasFilters ? scanLimit : limit
        const result = await projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
          PROJECT_DESIGN_DOC,
          'summary',
          {
            // Scan newest project_id first so recent projects surface within the scan window.
            startkey: [status, prefix + '\uffff'] as SummaryViewKey,
            endkey: [status, prefix] as SummaryViewKey,
            descending: true,
            limit: fetchLimit,
            skip,
            include_docs: false
          }
        )
        let rows = result.rows
        let total_rows = result.total_rows
        let scan_truncated = false
        if (hasFilters) {
          rows = rows.filter(r => matchesSummaryFilters(r.value, project_name_filter, application_filter))
          // With filters the view total is meaningless; report matches found within the scanned window.
          total_rows = rows.length
          scan_truncated = result.rows.length >= fetchLimit
        }
        const limited = rows.slice(0, limit)
        return {
          items: limited.map(mapRowToDetailsItem),
          total_rows,
          offset: result.offset,
          scan_truncated,
          scan_at_max: scan_truncated ? scan_at_max : undefined
        }
      }

      const fetchLimit = hasFilters ? scanLimit : skip + limit
      const [openResult, closedResult] = await Promise.all([
        projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
          PROJECT_DESIGN_DOC,
          'summary',
          {
            // Scan newest project_id first so recent projects surface within the scan window.
            startkey: ['open', prefix + '\uffff'] as SummaryViewKey,
            endkey: ['open', prefix] as SummaryViewKey,
            descending: true,
            limit: fetchLimit,
            skip: 0,
            include_docs: false
          }
        ),
        projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
          PROJECT_DESIGN_DOC,
          'summary',
          {
            // Scan newest project_id first so recent projects surface within the scan window.
            startkey: ['closed', prefix + '\uffff'] as SummaryViewKey,
            endkey: ['closed', prefix] as SummaryViewKey,
            descending: true,
            limit: fetchLimit,
            skip: 0,
            include_docs: false
          }
        )
      ])

      const merged = [...openResult.rows, ...closedResult.rows].sort((a, b) => {
        const ma = a.value.modification_time ?? ''
        const mb = b.value.modification_time ?? ''
        return mb.localeCompare(ma)
      })

      let rows = merged
      let total_rows = (openResult.total_rows ?? 0) + (closedResult.total_rows ?? 0)
      let scan_truncated = false
      if (hasFilters) {
        rows = rows.filter(r => matchesSummaryFilters(r.value, project_name_filter, application_filter))
        // With filters the view totals are meaningless; report matches found within the scanned window.
        total_rows = rows.length
        scan_truncated = openResult.rows.length >= fetchLimit || closedResult.rows.length >= fetchLimit
      }
      const paged = rows.slice(skip, skip + limit)

      return {
        items: paged.map(mapRowToDetailsItem),
        total_rows,
        offset: skip,
        scan_truncated,
        scan_at_max: scan_truncated ? scan_at_max : undefined
      }
    }
    catch {
      return { items: [], total_rows: undefined, offset: undefined }
    }
  }
}
