/*
 * ProjectService - read-only access to the external 'projects' database
 * *********************************************************************
 *
 * AVAILABILITY:
 * isProjectsAvailable() - Whether the projects database exists and is reachable
 *
 * READ:
 * getProjectById(id) - Fetch a single project document by _id
 * getProjectByProjectId(projectId) - Fetch a single project by project_id (uses project_id view)
 * listProjectsSummary(options) - List/search via summary view (project_id, project_name, application, etc.)
 * listProjectsPage(options) - List projects with Mango pagination (limit + bookmark)
 */

import 'dotenv/config'
import { couchDB } from '../database/couchdb'
import type {
  Project,
  ProjectsDbDocument,
  SummaryViewKey,
  SummaryViewValue
} from '../../types/projects'

const PROJECTS_DB_NAME = process.env.CLOUDANT_PROJECTS_DATABASE || 'projects'
const MAX_PAGE_SIZE = 200
const PROJECT_DESIGN_DOC = 'project'

const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)

/** DTO for list/search: fields needed to display and filter by project_name, project_id, application. */
export interface ProjectSummaryListItem {
  project_id: string;
  project_name?: string;
  application?: string | null;
  open_date?: string;
  close_date?: string;
  status?: string;
  no_samples?: number;
  affiliation?: string;
  contact?: string;
  priority?: string | null;
  modification_time?: string;
  [key: string]: unknown;
}

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
   * Get a single project document by _id.
   * Read-only. Returns null if the document or database is not found (e.g. DB missing in local dev).
   */
  async getProjectById(id: string): Promise<Project | null> {
    try {
      const doc = await projectsDB.getDocument<Project>(id)
      return doc
    }
    catch {
      return null
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
   * Optionally filter in-memory by project_name or application when view does not index them.
   */
  async listProjectsSummary(options?: {
    status?: 'open' | 'closed';
    project_id_prefix?: string;
    project_name_filter?: string;
    application_filter?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ items: ProjectSummaryListItem[]; total_rows?: number; offset?: number }> {
    try {
      const status = options?.status ?? 'open'
      const limit = Math.min(options?.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
      const skip = options?.skip ?? 0
      const prefix = options?.project_id_prefix ?? ''
      const hasFilters = !!(options?.project_name_filter?.trim() || options?.application_filter?.trim())
      const fetchLimit = hasFilters ? Math.min(limit * 10, 2000) : limit

      const startkey: SummaryViewKey = [status, prefix]
      const endkey: SummaryViewKey = [status, prefix + '\uffff']

      const result = await projectsDB.queryView<SummaryViewKey, SummaryViewValue, ProjectsDbDocument>(
        PROJECT_DESIGN_DOC,
        'summary',
        {
          startkey: startkey as unknown as SummaryViewKey,
          endkey: endkey as unknown as SummaryViewKey,
          limit: fetchLimit,
          skip,
          include_docs: false
        }
      )

      let rows = result.rows
      const project_name_filter = options?.project_name_filter?.trim().toLowerCase()
      const application_filter = options?.application_filter?.trim().toLowerCase()
      if (project_name_filter || application_filter) {
        rows = rows.filter((r) => {
          const v = r.value
          if (project_name_filter && (v.project_name ?? '').toLowerCase().indexOf(project_name_filter) < 0)
            return false
          if (application_filter && (v.application ?? '').toLowerCase().indexOf(application_filter) < 0)
            return false
          return true
        })
      }
      const limited = rows.slice(0, limit)

      const items: ProjectSummaryListItem[] = limited.map((row) => {
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
          modification_time: v.modification_time,
          ...v
        }
      })

      return {
        items,
        total_rows: result.total_rows,
        offset: result.offset
      }
    }
    catch {
      return { items: [], total_rows: undefined, offset: undefined }
    }
  },

  /**
   * List a page of project documents with bookmark-based pagination (Mango).
   * Use the returned bookmark to request the next page. Robust to large datasets (15k+ docs).
   * Prefer listProjectsSummary for listing when the summary view is available.
   */
  async listProjectsPage(options?: { limit?: number, bookmark?: string }): Promise<{ projects: Project[], bookmark?: string }> {
    try {
      const limit = Math.min(options?.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
      const result = await projectsDB.queryDocumentsPaginated<Project>(
        { entity_type: 'project_summary' },
        { limit, bookmark: options?.bookmark }
      )
      return {
        projects: result.docs,
        bookmark: result.bookmark
      }
    }
    catch {
      return { projects: [], bookmark: undefined }
    }
  }
}
