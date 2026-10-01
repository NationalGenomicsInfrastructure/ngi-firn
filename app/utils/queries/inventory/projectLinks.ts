import { defineQueryOptions } from '@pinia/colada'
import type { DisplayContainer, DisplayInventoryItem } from '~~/types/inventory'

// Key factory for project <-> inventory links.
export const INVENTORY_PROJECT_LINKS_QUERY_KEYS = {
  root: ['inventory', 'project-links'] as const,
  byProject: (projectId: string) => [...INVENTORY_PROJECT_LINKS_QUERY_KEYS.root, 'by-project', projectId] as const
} as const

export interface ProjectInventoryResult {
  containers: DisplayContainer[]
  items: DisplayInventoryItem[]
}

// Containers and items linked to one project (reverse lookup via the by_project view).
export const inventoryByProjectQuery = defineQueryOptions(
  (projectId: string) => ({
    key: INVENTORY_PROJECT_LINKS_QUERY_KEYS.byProject(projectId),
    query: (): Promise<ProjectInventoryResult> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.projectLinks.getInventoryByProject.query({ projectId })
    }
  })
)
