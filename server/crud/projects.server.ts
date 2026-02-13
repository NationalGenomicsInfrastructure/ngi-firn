/*
 * ProjectService - read-only access to the external 'projects' database
 * *********************************************************************
 *
 * AVAILABILITY:
 * isProjectsAvailable() - Whether the projects database exists and is reachable
 *
 * READ:
 * getProjectById(id) - Fetch a single project document by _id
 * listProjectsPage(options) - List projects with pagination (limit + bookmark)
 */

import 'dotenv/config'
import { couchDB } from '../database/couchdb'
import type { Project } from '../../types/projects'

const PROJECTS_DB_NAME = process.env.CLOUDANT_PROJECTS_DATABASE || 'projects'
const MAX_PAGE_SIZE = 200

const projectsDB = couchDB.withDatabase(PROJECTS_DB_NAME)

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
   * Get a single project document by ID.
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
   * List a page of project documents with bookmark-based pagination.
   * Use the returned bookmark to request the next page. Robust to large datasets (15k+ docs).
   * Returns empty list and no bookmark on error (e.g. database unavailable).
   *
   * Selector is minimal ({}); tighten once external schema is known (e.g. type: 'project').
   */
  async listProjectsPage(options?: { limit?: number, bookmark?: string }): Promise<{ projects: Project[], bookmark?: string }> {
    try {
      const limit = Math.min(options?.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
      const result = await projectsDB.queryDocumentsPaginated<Project>(
        {},
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
