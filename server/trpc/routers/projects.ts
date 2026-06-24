import { TRPCError } from '@trpc/server'
import { createTRPCRouter, firnUserProcedure } from '../init'
import type { ProjectsAvailableResultSchema, ProjectSingleResultSchema, ProjectListResultSchema, ProjectListWithDetailsResultSchema } from '~~/schemas/projects'
import {
  getProjectInputSchema,
  listProjectsSummaryInputSchema,
  addProjectBookmarkInputSchema,
  removeProjectBookmarkInputSchema,
  parseProjectDocument
} from '~~/schemas/projects'
import type { FirnProjectBookmark } from '~~/types/projects-firn'

export const projectsRouter = createTRPCRouter({

  isAvailable: firnUserProcedure
    .query(async (): Promise<ProjectsAvailableResultSchema> => {
      const { ProjectService } = await import('../../crud/projects.server')
      const available = await ProjectService.isProjectsAvailable()
      return available ? { available: true } : { available: false }
    }),

  /** Get a single project by project_id (the public identifier used in URLs, etc.). */
  getProject: firnUserProcedure
    .input(getProjectInputSchema)
    .query(async ({ input }): Promise<ProjectSingleResultSchema> => {
      const { ProjectService } = await import('../../crud/projects.server')
      const doc = await ProjectService.getProjectByProjectId(input.projectId)
      if (doc === null) {
        const available = await ProjectService.isProjectsAvailable()
        if (!available) {
          return { available: false }
        }
        return { available: true, data: null }
      }
      const parsed = parseProjectDocument(doc)
      return { available: true, data: parsed ?? null }
    }),

  /** List/search project summaries (top-level fields only). Supports ngi_project_id, project_name_filter (substring), application_filter, status, and pagination (limit, skip). */
  listSummaries: firnUserProcedure
    .input(listProjectsSummaryInputSchema.optional())
    .query(async ({ input }): Promise<ProjectListResultSchema> => {
      const { ProjectService } = await import('../../crud/projects.server')
      const available = await ProjectService.isProjectsAvailable()
      if (!available) {
        return { available: false }
      }
      const result = await ProjectService.listProjectsSummary(input)
      return {
        available: true,
        items: result.items,
        total_rows: result.total_rows,
        offset: result.offset,
        scan_truncated: result.scan_truncated,
        scan_at_max: result.scan_at_max
      }
    }),

  /** List/search project summaries with full view value (details, project_summary, order_details, etc.). For subset use (e.g. bookmarked projects). */
  listSummariesWithDetails: firnUserProcedure
    .input(listProjectsSummaryInputSchema.optional())
    .query(async ({ input }): Promise<ProjectListWithDetailsResultSchema> => {
      const { ProjectService } = await import('../../crud/projects.server')
      const available = await ProjectService.isProjectsAvailable()
      if (!available) {
        return { available: false }
      }
      const result = await ProjectService.listProjectsSummaryWithDetails(input)
      type WithDetailsSuccess = Extract<ProjectListWithDetailsResultSchema, { available: true }>
      return {
        available: true,
        items: result.items as WithDetailsSuccess['items'],
        total_rows: result.total_rows,
        offset: result.offset,
        scan_truncated: result.scan_truncated,
        scan_at_max: result.scan_at_max
      }
    }),

  /** Get all project bookmarks for the current user. */
  getProjectBookmarks: firnUserProcedure
    .query(async ({ ctx }): Promise<FirnProjectBookmark[]> => {
      if (!ctx.firnUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
      }
      const { UserService } = await import('../../crud/users.server')
      return UserService.getProjectBookmarks(ctx.firnUser)
    }),

  /**
   * Add a project bookmark for the current user.
   * Idempotent: does not duplicate bookmarks for the same projectId.
   * Returns null if the project does not exist or the user document could not be updated.
   */
  addProjectBookmark: firnUserProcedure
    .input(addProjectBookmarkInputSchema)
    .mutation(async ({ ctx, input }): Promise<FirnProjectBookmark[] | null> => {
      if (!ctx.firnUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
      }
      const { UserService } = await import('../../crud/users.server')
      const updatedBookmarks = await UserService.addProjectBookmark(ctx.firnUser, input.projectId)
      if (!updatedBookmarks) {
        return null
      }
      return updatedBookmarks
    }),

  /**
   * Remove a project bookmark for the current user.
   * When projectName is given, both projectId and projectName must match.
   * Returns null if the user document could not be updated.
   */
  removeProjectBookmark: firnUserProcedure
    .input(removeProjectBookmarkInputSchema)
    .mutation(async ({ ctx, input }): Promise<FirnProjectBookmark[] | null> => {
      if (!ctx.firnUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
      }
      const { UserService } = await import('../../crud/users.server')
      const updatedBookmarks = await UserService.removeProjectBookmark(
        ctx.firnUser,
        input.projectId,
        input.projectName
      )
      if (!updatedBookmarks) {
        return null
      }
      return updatedBookmarks
    })
})
