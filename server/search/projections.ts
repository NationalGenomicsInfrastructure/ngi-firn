/*
 * Pure projection helpers that turn authoritative CouchDB documents into the denormalized
 * Meilisearch index documents, and index documents back into client-safe hit DTOs.
 *
 * These functions are side-effect free (no engine, no network) so they can be unit-tested in
 * isolation. Location ancestry is resolved through an injected `resolveParent` lookup, which the
 * bootstrap path backs with an in-memory map of all documents and the incremental path backs with
 * a small on-demand fetch cache — keeping a single projection code path for both.
 */

import type { Container, InventoryItem, Room, StorageEquipment } from '../../types/inventory'
import type { ProjectsDbDocument, SummaryViewValue } from '../../types/projects'
import type { ProjectSummaryListItemSchema } from '../../schemas/projects'
import { SEARCH_HIGHLIGHT_POST, SEARCH_HIGHLIGHT_PRE } from '../../schemas/projects'
import type {
  InventoryIndexDocument,
  ProjectCatalogIndexDocument,
  LinkedProjectIndexDocument,
  SearchEntityKind,
  SearchInventoryHit,
  SearchProjectHit
} from '../../types/search'

/* Any stored inventory document that participates in search. */
export type StoredInventoryDoc = Room | StorageEquipment | Container | InventoryItem

/* CouchDB `type` discriminator → public search entity kind. */
const KIND_BY_DOC_TYPE: Record<string, SearchEntityKind> = {
  room: 'room',
  storageEquipment: 'equipment',
  container: 'container',
  inventoryItem: 'item'
}

export function searchEntityKindForDoc(doc: { type?: string }): SearchEntityKind | null {
  return (doc.type && KIND_BY_DOC_TYPE[doc.type]) || null
}

/* Build the public detail route for an entity kind + slug. */
export function buildInventoryDetailUrl(kind: SearchEntityKind, slug: string): string {
  switch (kind) {
    case 'room':
      return `/inventory/rooms/${slug}`
    case 'equipment':
      return `/inventory/equipment/${slug}/details`
    case 'container':
      return `/inventory/containers/${slug}/details`
    case 'item':
      return `/inventory/items/${slug}/details`
  }
}

export function buildProjectDetailUrl(projectId: string): string {
  return `/projects/details/${projectId}`
}

/*
 * Meilisearch primary keys accept only `A-Z a-z 0-9 - _`. CouchDB ids can contain other
 * characters (`:`, `+`, …), so derive a stable, collision-resistant safe id by replacing illegal
 * runs with `-` and appending a short hash of the original id.
 */
export function makeSearchSafeId(sourceId: string): string {
  const safe = sourceId.replace(/[^A-Za-z0-9_-]+/g, '-')
  let hash = 0
  for (let i = 0; i < sourceId.length; i++) {
    hash = (hash * 31 + sourceId.charCodeAt(i)) | 0
  }
  return `${safe}-${(hash >>> 0).toString(36)}`
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/* Parent reference id for hierarchy traversal (null for rooms / unplaced entities). */
function parentIdOf(doc: StoredInventoryDoc): string | null {
  if (doc.type === 'room') {
    return null
  }
  const parent = (doc as StorageEquipment | Container | InventoryItem).parent
  return parent?.id ?? null
}

/* Project membership extracted from a stored projectRefs map (containers/items only). */
function projectMembership(doc: StoredInventoryDoc): { projectIds: string[], projectDocIds: string[] } {
  if ((doc.type !== 'container' && doc.type !== 'inventoryItem')) {
    return { projectIds: [], projectDocIds: [] }
  }
  const refs = (doc as Container | InventoryItem).projectRefs
  if (!refs) {
    return { projectIds: [], projectDocIds: [] }
  }
  const projectIds: string[] = []
  const projectDocIds = new Set<string>()
  for (const [limsId, ref] of Object.entries(refs)) {
    projectIds.push(limsId)
    const entries = Array.isArray(ref) ? ref : [ref]
    for (const entry of entries) {
      if (entry?.id) {
        projectDocIds.add(entry.id)
      }
    }
  }
  return { projectIds, projectDocIds: [...projectDocIds] }
}

interface ProjectedSubtypeStatus {
  subtype: string | null
  status: string | null
  isActive: boolean | null
  classification: string | null
  barcode: string | null
  description: string | null
  notes: string | null
  lotNumber: string | null
  serialNumber: string | null
}

function subtypeStatusFields(doc: StoredInventoryDoc): ProjectedSubtypeStatus {
  switch (doc.type) {
    case 'room':
      return {
        subtype: nullableString(doc.roomType), status: null, isActive: doc.isActive,
        classification: null, barcode: null, description: nullableString(doc.description),
        notes: null, lotNumber: null, serialNumber: null
      }
    case 'storageEquipment':
      return {
        subtype: nullableString(doc.equipmentType), status: null, isActive: doc.isActive,
        classification: null, barcode: nullableString(doc.barcode),
        description: nullableString(doc.description), notes: null, lotNumber: null,
        serialNumber: nullableString(doc.serialNumber)
      }
    case 'container':
      return {
        subtype: nullableString(doc.containerType), status: nullableString(doc.status),
        isActive: null, classification: nullableString(doc.classification),
        barcode: nullableString(doc.barcode), description: nullableString(doc.description),
        notes: null, lotNumber: null, serialNumber: null
      }
    case 'inventoryItem':
      return {
        subtype: nullableString(doc.category), status: nullableString(doc.status),
        isActive: null, classification: nullableString(doc.classification),
        barcode: nullableString(doc.barcode), description: nullableString(doc.description),
        notes: nullableString(doc.notes), lotNumber: nullableString(doc.lotNumber),
        serialNumber: null
      }
  }
}

/*
 * Walk the parent chain to assemble the human-readable location ancestry (root room first) and
 * the slug of the containing room. `resolveParent` returns undefined for ids not available to the
 * caller; traversal stops there (a partial path is still useful and never loops thanks to the
 * visited guard).
 */
function resolveLocation(
  doc: StoredInventoryDoc,
  resolveParent: (id: string) => StoredInventoryDoc | undefined
): { locationPath: string[], locationSlugs: string[], roomSlug: string | null, parentSlug: string | null, parentKind: SearchEntityKind | null } {
  const ancestry: StoredInventoryDoc[] = []
  const visited = new Set<string>([doc._id])
  let currentParentId = parentIdOf(doc)

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = resolveParent(currentParentId)
    if (!parent) {
      break
    }
    ancestry.push(parent)
    currentParentId = parentIdOf(parent)
  }

  /* ancestry is innermost-first; reverse for a root→leaf path. */
  const ordered = [...ancestry].reverse()
  const roomAncestor = ordered.find(node => node.type === 'room')
  const immediateParent = ancestry[0]

  return {
    locationPath: ordered.map(node => node.name).filter((name): name is string => typeof name === 'string'),
    locationSlugs: ordered.map(node => node.slug).filter((slug): slug is string => typeof slug === 'string'),
    roomSlug: roomAncestor?.slug ?? (doc.type === 'room' ? doc.slug : null),
    parentSlug: immediateParent?.slug ?? null,
    parentKind: immediateParent ? searchEntityKindForDoc(immediateParent) : null
  }
}

/* Project one stored inventory document into its Meilisearch index document. */
export function toInventoryIndexDocument(
  doc: StoredInventoryDoc,
  resolveParent: (id: string) => StoredInventoryDoc | undefined
): InventoryIndexDocument | null {
  const kind = searchEntityKindForDoc(doc)
  if (!kind) {
    return null
  }

  const fields = subtypeStatusFields(doc)
  const location = resolveLocation(doc, resolveParent)
  const membership = projectMembership(doc)
  const updatedAt = typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date(0).toISOString()
  const updatedAtTs = Date.parse(updatedAt)

  return {
    id: makeSearchSafeId(doc._id),
    sourceId: doc._id,
    kind,
    slug: doc.slug,
    name: doc.name,
    label: nullableString(doc.label),
    barcode: fields.barcode,
    description: fields.description,
    notes: fields.notes,
    classification: fields.classification,
    subtype: fields.subtype,
    lotNumber: fields.lotNumber,
    serialNumber: fields.serialNumber,
    status: fields.status,
    isActive: fields.isActive,
    locationPath: location.locationPath,
    locationSlugs: location.locationSlugs,
    roomSlug: location.roomSlug,
    parentSlug: location.parentSlug,
    parentKind: location.parentKind,
    projectIds: membership.projectIds,
    projectDocIds: membership.projectDocIds,
    updatedAt,
    updatedAtTs: Number.isFinite(updatedAtTs) ? updatedAtTs : 0
  }
}

/* Read a (possibly nested) string field from an open-shaped projects document. */
function projectString(doc: object, path: string[]): string | null {
  let current: unknown = doc
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return null
    }
    current = (current as Record<string, unknown>)[key]
  }
  return nullableString(current)
}

/* Project a projects-DB document into its Meilisearch index document. */
export function toLinkedProjectIndexDocument(
  doc: ProjectsDbDocument,
  linkedCount: number
): LinkedProjectIndexDocument {
  const comments = [
    projectString(doc, ['details', 'project_comment']),
    projectString(doc, ['project_summary', 'comments'])
  ].filter((value): value is string => value !== null).join('\n\n')

  return {
    id: makeSearchSafeId(doc._id),
    docId: doc._id,
    projectId: doc.project_id,
    projectName: doc.project_name,
    application: nullableString(doc.application) ?? projectString(doc, ['details', 'application']),
    affiliation: nullableString(doc.affiliation),
    status: projectString(doc, ['status_fields', 'status']),
    referenceGenome: nullableString(doc.reference_genome) ?? projectString(doc, ['details', 'reference_genome']),
    organism: projectString(doc, ['details', 'organism']),
    projectDescription: projectString(doc, ['details', 'customer_project_description']),
    customerReference: nullableString(doc.customer_reference),
    contact: nullableString(doc.contact),
    coordinator: projectString(doc, ['details', 'project_coordinator']),
    labResponsible: projectString(doc, ['project_summary', 'lab_responsible']),
    bioinfoResponsible: projectString(doc, ['project_summary', 'bioinfo_responsible']),
    comments: comments.length > 0 ? comments : null,
    linkedCount
  }
}

/* Epoch ms for a date-ish string; 0 when absent/unparseable so sort stays total. */
function toEpochMs(value: string | null): number {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/* A `project/summary` view row: key is [status, project_id], `id` is the CouchDB document id. */
export interface CatalogSourceRow {
  id: string
  key: [string, string] | unknown
  value: SummaryViewValue
}

/*
 * Project one `project/summary` view row into a catalog document. Reads only allowlisted fields
 * from the (sample-free) summary value. Status comes from the view key, so the facet always agrees
 * with the CouchDB view that the fallback path uses (open iff LIMS-sourced without close_date).
 */
export function toProjectCatalogDocument(row: CatalogSourceRow): ProjectCatalogIndexDocument | null {
  const value = row.value
  const [keyStatus, keyProjectId] = Array.isArray(row.key) ? row.key as [string, string] : [undefined, undefined]
  const projectId = nullableString(value.project_id) ?? nullableString(keyProjectId)
  const projectName = nullableString(value.project_name)
  if (!row.id || !projectId || !projectName) {
    return null
  }

  const comments = [
    projectString(value, ['details', 'project_comment']),
    projectString(value, ['project_summary', 'comments'])
  ].filter((entry): entry is string => entry !== null).join('\n\n')

  const openDate = nullableString(value.open_date)
  const modificationTime = nullableString(value.modification_time)

  return {
    id: makeSearchSafeId(row.id),
    docId: row.id,
    projectId,
    projectName,
    status: keyStatus === 'open' ? 'open' : 'closed',
    application: nullableString(value.application) ?? projectString(value, ['details', 'application']),
    affiliation: nullableString(value.affiliation),
    organism: projectString(value, ['details', 'organism']),
    referenceGenome: nullableString(value.reference_genome) ?? projectString(value, ['details', 'reference_genome']),
    projectDescription: projectString(value, ['details', 'customer_project_description']),
    customerReference: nullableString(value.customer_reference),
    contact: nullableString(value.contact),
    coordinator: projectString(value, ['details', 'project_coordinator']),
    labResponsible: projectString(value, ['project_summary', 'lab_responsible']),
    bioinfoResponsible: projectString(value, ['project_summary', 'bioinfo_responsible']),
    priority: nullableString(value.priority),
    comments: comments.length > 0 ? comments : null,
    noSamples: typeof value.no_samples === 'number' ? value.no_samples : null,
    openDate,
    closeDate: nullableString(value.close_date),
    modificationTime,
    openDateTs: toEpochMs(openDate),
    modificationTs: toEpochMs(modificationTime)
  }
}

/* ------------------------------------------------------------------ */
/* Index document → client-safe hit                                    */
/* ------------------------------------------------------------------ */

export function toInventoryHit(doc: InventoryIndexDocument): SearchInventoryHit {
  return {
    id: doc.id,
    kind: doc.kind,
    slug: doc.slug,
    name: doc.name,
    label: doc.label,
    barcode: doc.barcode,
    description: doc.description,
    classification: doc.classification,
    subtype: doc.subtype,
    status: doc.status,
    isActive: doc.isActive,
    locationPath: doc.locationPath,
    roomSlug: doc.roomSlug,
    parentSlug: doc.parentSlug,
    parentKind: doc.parentKind,
    projectIds: doc.projectIds,
    detailUrl: buildInventoryDetailUrl(doc.kind, doc.slug)
  }
}

export function toProjectHit(doc: LinkedProjectIndexDocument): SearchProjectHit {
  return {
    projectId: doc.projectId,
    projectName: doc.projectName,
    application: doc.application,
    affiliation: doc.affiliation,
    status: doc.status,
    referenceGenome: doc.referenceGenome,
    organism: doc.organism,
    projectDescription: doc.projectDescription,
    customerReference: doc.customerReference,
    contact: doc.contact,
    coordinator: doc.coordinator,
    labResponsible: doc.labResponsible,
    bioinfoResponsible: doc.bioinfoResponsible,
    linkedCount: doc.linkedCount,
    detailUrl: buildProjectDetailUrl(doc.projectId)
  }
}

function highlighted(value: unknown): string | undefined {
  return typeof value === 'string' && value.includes(SEARCH_HIGHLIGHT_PRE) ? value : undefined
}

/*
 * Catalog document → the same snake_case list item the CouchDB path returns, so the table renders
 * both sources identically. `formatted` is Meilisearch's `_formatted` payload (highlight markers).
 */
export function toProjectCatalogItem(
  doc: ProjectCatalogIndexDocument,
  formatted?: Partial<Record<keyof ProjectCatalogIndexDocument, unknown>>
): ProjectSummaryListItemSchema {
  const highlights = {
    project_name: highlighted(formatted?.projectName),
    application: highlighted(formatted?.application),
    snippet: highlighted(formatted?.comments) ?? highlighted(formatted?.projectDescription)
  }
  const hasHighlights = Object.values(highlights).some(value => value !== undefined)

  return {
    project_id: doc.projectId,
    project_name: doc.projectName,
    application: doc.application,
    open_date: doc.openDate ?? undefined,
    close_date: doc.closeDate ?? undefined,
    status: doc.status,
    no_samples: doc.noSamples ?? undefined,
    affiliation: doc.affiliation ?? undefined,
    contact: doc.contact ?? undefined,
    priority: doc.priority,
    modification_time: doc.modificationTime ?? undefined,
    organism: doc.organism,
    coordinator: doc.coordinator,
    lab_responsible: doc.labResponsible,
    bioinfo_responsible: doc.bioinfoResponsible,
    ...(hasHighlights && { highlights })
  }
}

export { SEARCH_HIGHLIGHT_POST, SEARCH_HIGHLIGHT_PRE }
