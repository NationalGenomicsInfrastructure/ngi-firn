import type { DisplayContainer, DisplayInventoryActionLogEntry, InventoryProjectRef } from '~~/types/inventory'
import { defineQueryOptions } from '@pinia/colada'

// Key factory for the inventory containers domain.
// Hierarchical structure: invalidating `root` covers every container key;
// invalidating `detailBySlug(slug)` also covers actionLog and projectRefs sub-keys.
export const INVENTORY_CONTAINERS_QUERY_KEYS = {
  root: ['inventory', 'containers'] as const,
  all: () => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'all'] as const,
  byEquipment: (equipmentSlug: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'by-equipment', equipmentSlug] as const,
  byParent: (parentSlug: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'by-parent', parentSlug] as const,
  detailBySlug: (slug: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.root, 'detail', 'slug', slug] as const,
  actionLog: (slug: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), 'action-log'] as const,
  projectRefs: (slug: string) => [...INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug), 'project-refs'] as const
} as const

// Query for all containers across the whole inventory (index page; parent column shown)
export const allContainersQuery = defineQueryOptions<DisplayContainer[]>({
  key: INVENTORY_CONTAINERS_QUERY_KEYS.all(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.containers.getAllContainers.query()
  }
})

// Query for a single container by slug
export const containerBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.detailBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainerBySlug.query({ slug })
    }
  })
)

// Query for all direct-child containers of a piece of storage equipment
export const containersByEquipmentQuery = defineQueryOptions(
  (equipmentSlug: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.byEquipment(equipmentSlug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainersByEquipment.query({ equipmentSlug })
    }
  })
)

// Query for all direct-child containers of a container parent
export const containersByParentQuery = defineQueryOptions(
  (parentSlug: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.byParent(parentSlug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainersByParent.query({ parentSlug })
    }
  })
)

// On-demand query for the full audit log — only fetched when the user explicitly requests it.
// The DisplayContainer already carries the N most recent entries via recentActionLog.
export const containerActionLogQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.actionLog(slug),
    query: (): Promise<DisplayInventoryActionLogEntry[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainerActionLog.query({ slug })
    }
  })
)

// On-demand query for fully resolved project stubs (includes application, affiliation, status).
// The DisplayContainer carries lightweight slug/name hints; use this when the full
// InventoryProjectRef detail is needed (e.g. a dedicated project-links panel).
export const containerProjectRefsQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_CONTAINERS_QUERY_KEYS.projectRefs(slug),
    query: (): Promise<InventoryProjectRef[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.containers.getContainerProjectRefs.query({ slug })
    }
  })
)
