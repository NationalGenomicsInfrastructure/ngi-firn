/*
 * Task reference resolution - the one place where the public wire identifiers of the task schemas
 * (inventory kind + slug, LIMS project id) become stored CouchDB references, and where the display
 * snapshots of a step (object name, human-readable path) are captured or refreshed.
 *
 * Module boundary: this module reads the inventory services, so invalidation.server.ts and
 * stepState.server.ts (which inventory services import) must never import it.
 */
import { couchDB } from '../../database/couchdb'
import type { Container, InventoryItem, Room, StorageEquipment } from '../../../types/inventory'
import type { DocumentReference, TypedDocumentReference } from '../../../types/references'
import type { TaskInventoryObjectRef, TaskStepPayload } from '../../../types/productivity'
import type { TaskContextRefInput, TaskInventoryContextKind } from '../../../schemas/tasks/common'
import type { StepPayloadInput } from '../../../schemas/tasks/steps'
import { ContainerService } from '../inventory/containers.server'
import { EquipmentService } from '../inventory/equipment.server'
import { ItemService } from '../inventory/items.server'
import { RoomService } from '../inventory/rooms.server'
import { ProjectService } from '../projects.server'
import { TaskValidationError } from './common'

type InventoryDoc = Container | InventoryItem | StorageEquipment | Room
type TaskInventoryRef = TypedDocumentReference<InventoryDoc>

const PATH_SEPARATOR = ' › '
const MAX_PATH_DEPTH = 12

const KIND_LABEL: Record<TaskInventoryContextKind, string> = {
  container: 'Container',
  equipment: 'Storage equipment',
  item: 'Item',
  room: 'Room'
}

/* Fetch an inventory document by its public kind + slug, or fail with a validation error naming it. */
const FETCH_BY_SLUG: Record<TaskInventoryContextKind, (slug: string) => Promise<InventoryDoc | null>> = {
  container: slug => ContainerService.getContainerBySlug(slug),
  item: slug => ItemService.getItemBySlug(slug),
  equipment: slug => EquipmentService.getEquipmentBySlug(slug),
  room: slug => RoomService.getRoomBySlug(slug)
}

async function requireInventoryDoc(kind: TaskInventoryContextKind, slug: string): Promise<InventoryDoc> {
  const doc = await FETCH_BY_SLUG[kind](slug)
  if (!doc) throw new TaskValidationError(`${KIND_LABEL[kind]} "${slug}" does not exist.`)
  return doc
}

function toTypedRef<T extends InventoryDoc>(doc: T): TypedDocumentReference<T> {
  return { db: 'firn', id: doc._id, type: doc.type } as TypedDocumentReference<T>
}

interface LocatedDoc {
  _id: string
  type: string
  slug: string
  name: string
  parent?: { id?: string } | null
}

/*
 * The human-readable path of an object: the names of its ancestors (rooms excluded), plus the object
 * itself when `includeSelf` is set, which is how a destination is labelled.
 */
async function pathLabelOf(doc: LocatedDoc, includeSelf: boolean): Promise<string> {
  const names: string[] = []
  let parentId = doc.parent?.id
  for (let depth = 0; parentId && depth < MAX_PATH_DEPTH; depth++) {
    const parent = await couchDB.getDocument<LocatedDoc>(parentId)
    if (!parent || parent.type === 'room') break
    names.unshift(parent.name)
    parentId = parent.parent?.id
  }
  if (includeSelf) names.push(doc.name)
  return names.join(PATH_SEPARATOR)
}

/* Capture an object reference with its display snapshot at planning time. */
async function snapshotObjectRef<T extends InventoryDoc>(doc: T, includeSelf: boolean): Promise<TaskInventoryObjectRef<T>> {
  return {
    ref: toTypedRef(doc),
    slug: doc.slug,
    name: doc.name,
    pathLabel: await pathLabelOf(doc as unknown as LocatedDoc, includeSelf)
  }
}

/*
 * Refresh an object reference's display fields from the current inventory. While a step is open its
 * objects may be renamed or moved (a reservation never blocks that). An object that no longer exists,
 * or has no ancestors to name, keeps its stored snapshot.
 */
export async function liveObjectRef<T extends TaskInventoryObjectRef>(ref: T, includeSelf: boolean): Promise<T> {
  const doc = await couchDB.getDocument<LocatedDoc>(ref.ref.id)
  if (!doc) return ref
  const pathLabel = await pathLabelOf(doc, includeSelf)
  return { ...ref, slug: doc.slug, name: doc.name, pathLabel: pathLabel || ref.pathLabel }
}

/* Resolve a submitted step payload to its stored form, capturing display snapshots. */
export async function resolveStepPayload(input: StepPayloadInput): Promise<TaskStepPayload> {
  if (input.kind === 'text') {
    return {
      kind: 'text',
      title: input.title,
      body: input.body || null,
      contextRefs: input.contextRefs?.length ? await resolveContextRefs(input.contextRefs) : null
    }
  }

  const base = { kind: 'inventory' as const, expectedStatus: input.expectedStatus ?? null, notes: input.notes || null }
  switch (input.action) {
    case 'dispose': {
      const item = await requireInventoryDoc('item', input.target.slug) as InventoryItem
      return { ...base, action: 'dispose', targetKind: 'item', target: await snapshotObjectRef(item, false) }
    }
    case 'checkout':
    case 'return': {
      const target = await requireInventoryDoc(input.target.kind, input.target.slug) as Container | InventoryItem
      return { ...base, action: input.action, targetKind: input.target.kind, target: await snapshotObjectRef(target, false) }
    }
    case 'move':
    case 'locate': {
      const target = await requireInventoryDoc(input.target.kind, input.target.slug) as Container | InventoryItem
      const destination = await requireInventoryDoc(input.destination.kind, input.destination.slug)
      // The schema already limits the destination kind; this guards typed callers that bypass it.
      if (destination.type !== 'container' && destination.type !== 'storageEquipment') {
        throw new TaskValidationError('A move destination must be a storage equipment or a container, not a room.')
      }
      const parent = destination as Container | StorageEquipment
      return {
        ...base,
        action: input.action,
        targetKind: input.target.kind,
        target: await snapshotObjectRef(target, false),
        destination: {
          parent: await snapshotObjectRef(parent, true),
          position: input.destination.position ?? null
        }
      }
    }
  }
}

/* Resolve LIMS project ids to project references (deduplicated, unknown ids rejected). */
export async function resolveProjectRefs(projectIds: string[]): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = []
  for (const projectId of [...new Set(projectIds)]) {
    const built = await ProjectService.buildProjectDocumentRef(projectId)
    if (!built) throw new TaskValidationError(`Project "${projectId}" does not exist.`)
    refs.push({ ...built.ref, type: 'project' })
  }
  return refs
}

/* Resolve inventory context links of a task (never reserving anything). */
export async function resolveInventoryContextRefs(
  refs: { kind: TaskInventoryContextKind, slug: string }[]
): Promise<TaskInventoryRef[]> {
  const resolved: TaskInventoryRef[] = []
  for (const ref of refs) {
    const doc = await requireInventoryDoc(ref.kind, ref.slug)
    resolved.push({ ...toTypedRef(doc), slug: doc.slug, name: doc.name })
  }
  return resolved
}

/* Resolve the context references of a free-text step (inventory or projects). */
async function resolveContextRefs(refs: TaskContextRefInput[]): Promise<DocumentReference[]> {
  const projectIds = refs.filter(ref => ref.kind === 'project').map(ref => ref.slug)
  const inventory = refs.flatMap(ref => ref.kind === 'project' ? [] : [{ kind: ref.kind, slug: ref.slug }])
  return [...await resolveInventoryContextRefs(inventory), ...await resolveProjectRefs(projectIds)]
}

/* The CouchDB id of an inventory object, for link-view lookups. */
export async function resolveInventoryDocId(kind: TaskInventoryContextKind, slug: string): Promise<string> {
  return (await requireInventoryDoc(kind, slug))._id
}

/* The CouchDB id of a project addressed by its LIMS project id, for link-view lookups. */
export async function resolveProjectDocId(projectId: string): Promise<string> {
  const [ref] = await resolveProjectRefs([projectId])
  return ref!.id
}
