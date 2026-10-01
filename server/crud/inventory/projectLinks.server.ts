/*
 * ProjectLinkService - Table of Contents
 * **************************************
 *
 * Batch and reverse-lookup helpers for project references on containers and items.
 * Single-entity add/remove stays in ContainerService / ItemService.
 *
 * getInventoryByProject(projectId) - Containers and items linked to a project (by_project view)
 * linkEntities(projectId, entities) - Best-effort batch link; sequential to avoid _rev conflicts
 * unlinkEntities(projectId, entities) - Best-effort batch unlink
 */

import { couchDB } from '../../database/couchdb'
import { ensureViews } from '../views'
import { ProjectService } from '../projects.server'
import { ContainerService } from './containers.server'
import { ItemService } from './items.server'
import type { Container, DisplayContainer, DisplayInventoryItem, InventoryItem } from '../../../types/inventory'
import type { ProjectLinkEntity, ProjectLinkResult } from '../../../schemas/inventory/projectLinks'

type LinkableDoc = Container | InventoryItem

async function applyBatch(
  mode: 'link' | 'unlink',
  projectId: string,
  entities: ProjectLinkEntity[]
): Promise<ProjectLinkResult> {
  // Fail the whole batch up front when the project does not exist.
  if (mode === 'link' && !(await ProjectService.getProjectByProjectId(projectId))) {
    throw new Error(`Project "${projectId}" was not found.`)
  }

  const result: ProjectLinkResult = { changed: [], unchanged: [], failed: [] }
  const seen = new Set<string>()

  for (const { entityKind, slug } of entities) {
    const dedupeKey = `${entityKind}:${slug}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    try {
      const current: LinkableDoc | null = entityKind === 'item'
        ? await ItemService.getItemBySlug(slug)
        : await ContainerService.getContainerBySlug(slug)
      if (!current) {
        result.failed.push({ slug, reason: 'Not found' })
        continue
      }

      const isLinked = !!current.projectRefs && projectId in current.projectRefs
      if (isLinked === (mode === 'link')) {
        result.unchanged.push(slug)
        continue
      }

      const updated = entityKind === 'item'
        ? await (mode === 'link' ? ItemService.addProjectRef(slug, projectId) : ItemService.removeProjectRef(slug, projectId))
        : await (mode === 'link' ? ContainerService.addProjectRef(slug, projectId) : ContainerService.removeProjectRef(slug, projectId))
      if (updated) result.changed.push(slug)
      else result.failed.push({ slug, reason: 'Update failed' })
    }
    catch (error) {
      result.failed.push({ slug, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}

export const ProjectLinkService = {
  /*
   * List every container and item linked to a project. The by_project view is keyed by the
   * project document _id (not the LIMS project_id) and emits once per ref entry, so documents
   * are deduplicated by _id.
   */
  async getInventoryByProject(projectId: string): Promise<{ containers: DisplayContainer[], items: DisplayInventoryItem[] }> {
    const project = await ProjectService.getProjectByProjectId(projectId)
    if (!project) return { containers: [], items: [] }

    await ensureViews()
    const response = await couchDB.queryView<[string, string], unknown, LinkableDoc>(
      'firn-inventory',
      'by_project',
      { key: ['projects', project._id], include_docs: true }
    )

    const docs = new Map<string, LinkableDoc>()
    for (const row of response.rows) {
      if (row.doc) docs.set(row.doc._id, row.doc)
    }
    const all = [...docs.values()]
    const [containers, items] = await Promise.all([
      ContainerService.convertMultipleToDisplayContainers(all.filter((d): d is Container => d.type === 'container')),
      ItemService.convertMultipleToDisplayItems(all.filter((d): d is InventoryItem => d.type === 'inventoryItem'))
    ])
    return { containers, items }
  },

  linkEntities: (projectId: string, entities: ProjectLinkEntity[]) => applyBatch('link', projectId, entities),
  unlinkEntities: (projectId: string, entities: ProjectLinkEntity[]) => applyBatch('unlink', projectId, entities)
}
