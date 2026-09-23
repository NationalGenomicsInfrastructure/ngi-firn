import { defineQueryOptions } from '@pinia/colada'
import type {
  AcceptedChildCapacity,
  DisplayInventoryActionLogEntry,
  DisplayInventoryItem,
  InventoryProjectRef,
  ItemMoveTarget
} from '~~/types/inventory'
import type { ItemParentKind } from '~~/schemas/inventory/items'

export const INVENTORY_ITEMS_QUERY_KEYS = {
  root: ['inventory', 'items'] as const,
  all: () => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'all'] as const,
  byEquipment: (equipmentSlug: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'by-equipment', equipmentSlug] as const,
  byParent: (parentSlug: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'by-parent', parentSlug] as const,
  detailBySlug: (slug: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'detail', 'slug', slug] as const,
  actionLog: (slug: string) => [...INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(slug), 'action-log'] as const,
  projectRefs: (slug: string) => [...INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(slug), 'project-refs'] as const,
  acceptedCapacity: (parentKind: ItemParentKind, parentSlug: string) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'accepted-capacity', parentKind, parentSlug] as const,
  moveTargets: (itemSlug: string, showAllClassifications = false) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'move-targets', itemSlug, showAllClassifications] as const,
  moveTargetsBatch: (itemSlugs: string[], showAllClassifications = false) => [...INVENTORY_ITEMS_QUERY_KEYS.root, 'move-targets-batch', ...[...itemSlugs].sort(), showAllClassifications] as const
} as const

export const allItemsQuery = defineQueryOptions<DisplayInventoryItem[]>({
  key: INVENTORY_ITEMS_QUERY_KEYS.all(),
  query: () => {
    const { $trpc } = useNuxtApp()
    return $trpc.inventory.items.getAllItems.query()
  }
})

export const itemBySlugQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.detailBySlug(slug),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemBySlug.query({ slug })
    }
  })
)

export const itemsByEquipmentQuery = defineQueryOptions(
  (equipmentSlug: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.byEquipment(equipmentSlug),
    query: (): Promise<DisplayInventoryItem[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemsByEquipment.query({ equipmentSlug })
    }
  })
)

export const itemsByParentQuery = defineQueryOptions(
  (parentSlug: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.byParent(parentSlug),
    query: (): Promise<DisplayInventoryItem[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemsByParent.query({ parentSlug })
    }
  })
)

export const acceptedItemCapacityQuery = defineQueryOptions(
  (args: { parentSlug: string, parentKind: ItemParentKind }) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.acceptedCapacity(args.parentKind, args.parentSlug),
    query: (): Promise<AcceptedChildCapacity[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getAcceptedItemCapacity.query(args)
    }
  })
)

export const itemMoveTargetsQuery = defineQueryOptions(
  (itemSlug: string, showAllClassifications = false) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.moveTargets(itemSlug, showAllClassifications),
    query: (): Promise<ItemMoveTarget[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getMoveTargets.query({ itemSlug, showAllClassifications })
    }
  })
)

export const itemMoveTargetsBatchQuery = defineQueryOptions(
  (args: { itemSlug: string[], showAllClassifications?: boolean }) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.moveTargetsBatch(args.itemSlug, args.showAllClassifications ?? false),
    query: (): Promise<ItemMoveTarget[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getMoveTargetsForItems.query(args)
    }
  })
)

export const itemActionLogQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.actionLog(slug),
    query: (): Promise<DisplayInventoryActionLogEntry[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemActionLog.query({ slug })
    }
  })
)

export const itemProjectRefsQuery = defineQueryOptions(
  (slug: string) => ({
    key: INVENTORY_ITEMS_QUERY_KEYS.projectRefs(slug),
    query: (): Promise<InventoryProjectRef[]> => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.items.getItemProjectRefs.query({ slug })
    }
  })
)
