import { defineQueryOptions } from '@pinia/colada'

// Key factory for inventory containers domain
export const INVENTORY_CONTAINERS_QUERY_KEYS = {
  root: ['inventory', 'containers'] as const,
  container: (containerId: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'container', containerId] as const,
  byParent: (parentId: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'byParent', parentId] as const,
  contents: (containerId: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'contents', containerId] as const,
  descendants: (containerId: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'descendants', containerId] as const,
  suggest: (params: Record<string, unknown>) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'suggest', params] as const,
  byProject: (db: string, projectId: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'byProject', db, projectId] as const
} as const

// Query for a single container by ID
export const containerQuery = defineQueryOptions(
  (containerId: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.container(containerId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainer.query({ containerId })
    }
  })
)

// Query for containers by parent ID
export const containersByParentQuery = defineQueryOptions(
  (parentId: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.byParent(parentId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainersByParent.query({ parentId })
    }
  })
)

// Query for the contents of a container (child containers and items)
export const containerContentsQuery = defineQueryOptions(
  (containerId: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.contents(containerId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainerContents.query({ containerId })
    }
  })
)

// Query for all descendants of a container
export const containerDescendantsQuery = defineQueryOptions(
  (containerId: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.descendants(containerId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getDescendants.query({ containerId })
    }
  })
)

// Query for suggested locations matching placement criteria
export const suggestLocationsQuery = defineQueryOptions(
  (params: {
    category: string
    childType: 'item' | 'container'
    count: number
    classification?: string | null
    ancestorId?: string | null
    temperatureCelsius?: number | null
  }) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.suggest({ ...params }),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.suggestLocations.query(params)
    }
  })
)

// Query for containers and items belonging to a project
export const containersByProjectQuery = defineQueryOptions(
  (params: { projectId: string, db?: string }) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.byProject(params.db ?? 'projects', params.projectId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getByProject.query(params)
    }
  })
)
