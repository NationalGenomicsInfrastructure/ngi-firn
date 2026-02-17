import type {
  ProjectsAvailableResultSchema,
  ProjectSingleResultSchema,
  ProjectListResultSchema,
  ListProjectsSummaryInputSchema
} from '~~/schemas/projects'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for projects domain
export const PROJECTS_QUERY_KEYS = {
  root: ['projects'] as const,
  available: () => [...PROJECTS_QUERY_KEYS.root, 'available'] as const,
  summaries: (params?: ListProjectsSummaryInputSchema) => [...PROJECTS_QUERY_KEYS.root, 'summaries', params ?? {}] as const,
  /** Single project by project_id (public identifier, used in URLs). */
  project: (projectId: string) => [...PROJECTS_QUERY_KEYS.root, 'project', projectId] as const
} as const

// Query for projects database availability
export const projectsAvailableQuery = defineQueryOptions<ProjectsAvailableResultSchema>({
  key: PROJECTS_QUERY_KEYS.available(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.projects.isAvailable.query()
  }
})

// Query for project summaries (search by project_id prefix, project_name substring, application, status; pagination via limit/skip)
export const projectSummariesQuery = defineQueryOptions(
  (params?: ListProjectsSummaryInputSchema) => ({
    key: PROJECTS_QUERY_KEYS.summaries(params),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.projects.listSummaries.query(params)
    }
  })
)

export type ProjectSummariesQueryResult = ProjectListResultSchema

// Query for a single project by project_id (public identifier, e.g. URL slug)
export const projectQuery = defineQueryOptions(
  (projectId: string) => ({
    key: PROJECTS_QUERY_KEYS.project(projectId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.projects.getProject.query({ projectId })
    }
  })
)

export type ProjectQueryResult = ProjectSingleResultSchema
