import { createTRPCRouter, firnUserProcedure } from '../init'
import type { ProjectsAvailableResultSchema, ProjectSingleResultSchema, ProjectListResultSchema } from '~~/schemas/projects'
import {
  getProjectInputSchema,
  listProjectsSummaryInputSchema,
  parseProjectDocument
} from '~~/schemas/projects'

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

  /** List/search project summaries. Supports project_id_prefix, project_name_filter (substring), application_filter, status, and pagination (limit, skip). */
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
        offset: result.offset
      }
    })
})
