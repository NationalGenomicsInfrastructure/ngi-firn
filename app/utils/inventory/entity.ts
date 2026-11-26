import type { EntityKind } from '~~/schemas/basic'

/*
 * Icon and details route of a referenced entity (inventory object, project or task) by its kind.
 * Icons are bound dynamically, so every i-lucide-* here must also be in uno.config.ts `safelist`.
 */
export const ENTITY_KIND_ICONS: Record<EntityKind, string> = {
  room: 'i-lucide-door-open',
  equipment: 'i-lucide-refrigerator',
  container: 'i-lucide-package',
  item: 'i-lucide-test-tube',
  project: 'i-lucide-folder',
  task: 'i-lucide-clipboard-list',
  template: 'i-lucide-file-text'
}

export function entityKindIcon(kind: EntityKind): string {
  return ENTITY_KIND_ICONS[kind]
}

/* Details page of an entity; null for templates, which have none. */
export function entityRoute(ref: { kind: Exclude<EntityKind, 'template'>, slug: string }): string
export function entityRoute(ref: { kind: EntityKind, slug: string }): string | null
export function entityRoute({ kind, slug }: { kind: EntityKind, slug: string }): string | null {
  const id = encodeURIComponent(slug)
  switch (kind) {
    case 'room': return `/inventory/rooms/${id}`
    case 'equipment': return `/inventory/equipment/${id}/details`
    case 'container': return `/inventory/containers/${id}/details`
    case 'item': return `/inventory/items/${id}/details`
    case 'project': return `/projects/details/${id}`
    case 'task': return `/tasks/details/${id}`
    default: return null
  }
}
