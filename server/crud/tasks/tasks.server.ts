/*
 * TaskService - actor-aware CRUD, sharing, access control and queries for the task aggregate.
 *
 * A task is the shareable unit. Steps live in separate documents (see TaskStepService) so one
 * colleague's edit never rewrites the whole task. Every mutating method takes the acting FirnUser
 * and enforces access control inside the service, so a direct call cannot bypass authorization.
 *
 * This service performs NO inventory mutation: planning and sharing never touch the inventory or
 * acquire physical holds. Holds are introduced by the activation/reservation services (later phases).
 */
import { DateTime } from 'luxon'

import { couchDB, generateCouchDocId, generateSlug, isCouchConflict } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { DocumentReference, TypedDocumentReference } from '../../../types/references'
import type { Container, InventoryItem, Room, SerializedEntityRef, StorageEquipment } from '../../../types/inventory'
import type { DisplayTask, TaskDocument, TaskStepDocument } from '../../../types/productivity'
import type { TaskInventoryContextKind, TaskListOptions } from '../../../schemas/tasks/common'
import type {
  CreateTaskSchemaInput,
  SetSharingSchemaInput,
  UpdateTaskMetadataSchemaInput
} from '../../../schemas/tasks/tasks'
import {
  resolveInventoryContextRefs,
  resolveInventoryDocId,
  resolveProjectDocId,
  resolveProjectRefs
} from './references.server'
import { ForbiddenError } from '../../auth/errors'
import { loadActivationsForTask } from './stepState.server'
import {
  assertCanClaimTask,
  assertCanManageTask,
  assertCanReadTask,
  assertCanReleaseResponsibility,
  assertTaskCanBeCancelled,
  assertTaskCanBePublished,
  canExecuteTask,
  executorsLosingTheirRight,
  isTaskClaimed,
  liveWorkRefusal,
  ownerIdOf,
  taskActionsFor,
  resolveTaskRole
} from '../../auth/taskPolicy'
import {
  isActiveApprovedUser,
  resolveUserRefs,
  toUserRef,
  UNKNOWN_USER_REF
} from '../users.server'
import {
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
  clampPageSize,
  computeQuadrant,
  computeUrgency,
  normalizeMembers,
  resolveUsersByFirnIds,
  summarizeProgress,
  toDisplayActor,
  userActor
} from './common'

/* Inventory reference shape accepted for task-level context links. */
type TaskInventoryRef = TypedDocumentReference<Container | InventoryItem | StorageEquipment | Room>

export interface TaskListResult {
  tasks: DisplayTask[]
  total: number
}

function dedupeProjectRefs(refs: DocumentReference[] | null | undefined): DocumentReference[] | null {
  if (!refs || refs.length === 0) return null
  const seen = new Map<string, DocumentReference>()
  for (const ref of refs) {
    if (ref?.id && !seen.has(ref.id)) seen.set(ref.id, ref)
  }
  return seen.size > 0 ? [...seen.values()] : null
}

function dedupeInventoryRefs(refs: TaskInventoryRef[] | null | undefined): TaskInventoryRef[] | null {
  if (!refs || refs.length === 0) return null
  const seen = new Map<string, TaskInventoryRef>()
  for (const ref of refs) {
    if (ref?.id && !seen.has(ref.id)) seen.set(ref.id, ref)
  }
  return seen.size > 0 ? [...seen.values()] : null
}

/* Project a reference's stored hint fields into a client-safe entity stub. */
export function refToEntityStub(ref: DocumentReference, kind: SerializedEntityRef['kind']): SerializedEntityRef {
  return { slug: ref.slug ?? ref.id, name: ref.name ?? ref.slug ?? ref.id, kind }
}

/*
 * A task with work in flight cannot be cancelled or archived out from under its executor: its
 * activation still holds inventory and someone may be mid-way through the physical work. The
 * activation has to be cancelled first, which asks per step whether it was physically performed, so
 * holds are never released blindly.
 */
async function assertNoLiveActivation(task: TaskDocument, verb: 'cancelled' | 'archived'): Promise<void> {
  const refusal = liveWorkRefusal(await loadActivationsForTask(task._id), verb)
  if (refusal) throw new TaskValidationError(refusal)
}

/*
 * Refuse a sharing or ownership change that would leave the executor of live work without the
 * right to execute it. After the change the executor must still be the owner or responsible; if
 * not, the activation has to be handed over or cancelled first.
 */
async function assertExecutorsKeepTheirRight(
  task: TaskDocument,
  nextResponsible: { id: string }[],
  nextOwnerId: string | null
): Promise<void> {
  const [stranded] = executorsLosingTheirRight(await loadActivationsForTask(task._id), nextResponsible, nextOwnerId)
  if (!stranded) return
  const [ref] = await resolveUserRefs([stranded])
  const who = ref && ref.name !== UNKNOWN_USER_REF.name ? ref.name : 'This colleague'
  throw new TaskValidationError(
    `${who} is currently executing activated work on this task. Hand the activation over or cancel it first.`
  )
}

export const TaskService = {
  // -------------------------------------------------------------------------
  // Creation and retrieval
  // -------------------------------------------------------------------------

  async createTask(actor: FirnUser, input: CreateTaskSchemaInput): Promise<TaskDocument> {
    if (!isActiveApprovedUser(actor)) {
      throw new ForbiddenError('Only approved, active users can create tasks.')
    }
    const title = input.title?.trim()
    if (!title) throw new TaskValidationError('A task title is required.')

    const members = normalizeMembers(
      actor._id,
      (await resolveUsersByFirnIds(input.responsibleFirnIds ?? [])).map(toUserRef),
      (await resolveUsersByFirnIds(input.viewerFirnIds ?? [])).map(toUserRef)
    )
    const projectRefs = await resolveProjectRefs(input.projectIds ?? [])
    const inventoryRefs = await resolveInventoryContextRefs(input.inventoryRefs ?? [])

    const now = DateTime.now().toISO()
    const doc: Omit<TaskDocument, '_id' | '_rev'> = {
      type: 'task',
      schema: 1,
      slug: generateSlug(title),
      title,
      description: input.description?.trim() || null,
      creator: userActor(actor),
      managingOwner: userActor(actor),
      ...members,
      visibility: input.visibility ?? 'private',
      status: 'draft',
      importance: input.importance ?? 'ordinary',
      dueDate: input.dueDate ?? null,
      projectRefs: dedupeProjectRefs(projectRefs),
      inventoryRefs: dedupeInventoryRefs(inventoryRefs),
      cleanupScope: null,
      editVersion: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
      archivedAt: null
    }
    const result = await couchDB.createDocument({ ...doc, _id: generateCouchDocId('task') })
    const created = await couchDB.getDocument<TaskDocument>(result.id)
    if (!created) throw new Error('Failed to read back the created task.')
    return created
  },

  /* Fetch a raw task document by slug (internal; no ACL check). */
  async getTaskDocBySlug(slug: string): Promise<TaskDocument | null> {
    const rows = (await couchDB.queryView<string, null, TaskDocument>('firn-tasks', 'by_slug', {
      key: slug,
      include_docs: true
    })).rows
    const doc = rows[0]?.doc
    return doc && doc.type === 'task' ? doc : null
  },

  /* Fetch a task by slug, enforcing that the actor may read it. */
  async requireReadableTask(actor: FirnUser, slug: string): Promise<TaskDocument> {
    const task = await TaskService.getTaskDocBySlug(slug)
    if (!task) throw new TaskNotFoundError()
    assertCanReadTask(task, actor)
    return task
  },

  async getDisplayTask(actor: FirnUser, slug: string): Promise<DisplayTask> {
    const task = await TaskService.requireReadableTask(actor, slug)
    const steps = await TaskService.getStepsForTask(task._id)
    return TaskService.toDisplayTask(task, actor, steps)
  },

  // -------------------------------------------------------------------------
  // Steps helper (read-only here; mutations live in TaskStepService)
  // -------------------------------------------------------------------------

  async getStepsForTask(taskId: string): Promise<TaskStepDocument[]> {
    const rows = (await couchDB.queryView<[string, number], null, TaskStepDocument>('firn-tasks', 'steps_by_task', {
      startkey: [taskId, 0],
      endkey: [taskId, Number.MAX_SAFE_INTEGER],
      include_docs: true
    })).rows
    return rows
      .map(r => r.doc)
      .filter((d): d is TaskStepDocument => !!d && d.type === 'taskStep')
      .sort((a, b) => a.order - b.order)
  },

  // -------------------------------------------------------------------------
  // Metadata, sharing, lifecycle
  // -------------------------------------------------------------------------

  async updateMetadata(actor: FirnUser, slug: string, patch: UpdateTaskMetadataSchemaInput): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManageTask(task, actor)
    if (patch.expectedEditVersion !== undefined && patch.expectedEditVersion !== task.editVersion) {
      throw new TaskConflictError('The task was edited since you loaded it; please reload and retry.')
    }
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new TaskValidationError('A task title cannot be empty.')
    }
    const updated: TaskDocument = {
      ...task,
      title: patch.title !== undefined ? patch.title.trim() : task.title,
      description: patch.description !== undefined ? (patch.description?.trim() || null) : task.description,
      importance: patch.importance ?? task.importance,
      dueDate: patch.dueDate !== undefined ? patch.dueDate : task.dueDate,
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    return TaskService.writeWithCas(task, updated)
  },

  async setSharing(actor: FirnUser, slug: string, input: SetSharingSchemaInput): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManageTask(task, actor)

    const ownerId = ownerIdOf(task)
    let responsibleUsers = task.responsibleUsers
    let viewers = task.viewers
    if (input.responsibleFirnIds !== undefined) {
      responsibleUsers = (await resolveUsersByFirnIds(input.responsibleFirnIds)).map(toUserRef)
    }
    if (input.viewerFirnIds !== undefined) {
      viewers = (await resolveUsersByFirnIds(input.viewerFirnIds)).map(toUserRef)
    }
    const members = normalizeMembers(ownerId, responsibleUsers, viewers)

    await assertExecutorsKeepTheirRight(task, members.responsibleUsers, ownerId)

    const updated: TaskDocument = {
      ...task,
      visibility: input.visibility ?? task.visibility,
      ...members,
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    return TaskService.writeWithCas(task, updated)
  },

  /* Publish a draft task so colleagues can see and (if public and unassigned) claim it. */
  async publishTask(actor: FirnUser, slug: string): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManageTask(task, actor)
    if (task.status === 'open') return task
    assertTaskCanBePublished(task)
    const updated: TaskDocument = {
      ...task,
      status: 'open',
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    return TaskService.writeWithCas(task, updated)
  },

  async transferOwnership(actor: FirnUser, slug: string, newOwnerFirnId: string): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManageTask(task, actor)
    const [newOwner] = await resolveUsersByFirnIds([newOwnerFirnId])
    if (!newOwner) throw new TaskValidationError('The new owner could not be resolved.')

    const newOwnerRef = toUserRef(newOwner)
    // The new owner cannot simultaneously be a responsible/viewer member.
    const members = normalizeMembers(newOwnerRef.id, task.responsibleUsers, task.viewers)
    await assertExecutorsKeepTheirRight(task, members.responsibleUsers, newOwnerRef.id)
    const updated: TaskDocument = {
      ...task,
      managingOwner: userActor(newOwner),
      ...members,
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    return TaskService.writeWithCas(task, updated)
  },

  async archiveTask(actor: FirnUser, slug: string): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManageTask(task, actor)
    if (task.archivedAt) return task
    await assertNoLiveActivation(task, 'archived')
    const updated: TaskDocument = {
      ...task,
      archivedAt: DateTime.now().toISO(),
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    return TaskService.writeWithCas(task, updated)
  },

  async cancelTask(actor: FirnUser, slug: string): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManageTask(task, actor)
    if (task.status === 'cancelled') return task
    assertTaskCanBeCancelled(task)
    await assertNoLiveActivation(task, 'cancelled')
    const now = DateTime.now().toISO()
    const updated: TaskDocument = {
      ...task,
      status: 'cancelled',
      cancelledAt: now,
      editVersion: task.editVersion + 1,
      updatedAt: now
    }
    return TaskService.writeWithCas(task, updated)
  },

  // -------------------------------------------------------------------------
  // Claiming and responsibility (pool)
  // -------------------------------------------------------------------------

  /*
   * Atomically claim an unassigned public task. Uses the task document's _rev as a CAS guard so
   * exactly one of several concurrent claimants wins; the loser receives a TaskConflictError.
   */
  async claimTask(actor: FirnUser, slug: string): Promise<TaskDocument> {
    const task = await TaskService.getTaskDocBySlug(slug)
    if (!task) throw new TaskNotFoundError()
    assertCanClaimTask(task, actor)
    if (isTaskClaimed(task)) {
      throw new TaskConflictError('This task has already been claimed.')
    }

    const updated: TaskDocument = {
      ...task,
      // A viewer who claims the task moves over to the responsible users.
      ...normalizeMembers(ownerIdOf(task), [toUserRef(actor)], task.viewers),
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    try {
      const result = await couchDB.updateDocument(task._id, updated, task._rev)
      return { ...updated, _id: result.id, _rev: result.rev }
    }
    catch (error) {
      if (isCouchConflict(error)) {
        throw new TaskConflictError('This task was claimed by someone else first.')
      }
      throw error
    }
  },

  async releaseResponsibility(actor: FirnUser, slug: string): Promise<TaskDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanReleaseResponsibility(task, actor)
    const remaining = task.responsibleUsers.filter(r => r.id !== actor._id)
    await assertExecutorsKeepTheirRight(task, remaining, ownerIdOf(task))
    const updated: TaskDocument = {
      ...task,
      responsibleUsers: remaining,
      editVersion: task.editVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    return TaskService.writeWithCas(task, updated)
  },

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  /* Tasks the actor can see: owned, responsible, viewer, or any public task. */
  async listForUser(actor: FirnUser, options: TaskListOptions = {}): Promise<TaskListResult> {
    const ids = new Set<string>()
    for (const view of ['by_owner', 'by_responsible', 'by_viewer'] as const) {
      const rows = (await couchDB.queryView<string, null>('firn-tasks', view, { key: actor._id })).rows
      for (const row of rows) if (row.id) ids.add(row.id)
    }
    // Public tasks (any status) are readable; collect their ids too.
    const publicRows = (await couchDB.queryView<[string, string], null>('firn-tasks', 'by_visibility_status', {
      startkey: ['public', ''],
      endkey: ['public', '\uffff']
    })).rows
    for (const row of publicRows) if (row.id) ids.add(row.id)

    const docs = (await couchDB.getDocumentsByIds<TaskDocument>([...ids]))
      .filter((d): d is TaskDocument => !!d && d.type === 'task')
      .filter(d => options.includeArchived ? true : !d.archivedAt)
      .filter(d => resolveTaskRole(d, actor) !== null)

    return TaskService.paginateAndProject(actor, docs, options)
  },

  /* Public, open, unassigned tasks available for the taking. */
  async listPool(actor: FirnUser, options: TaskListOptions = {}): Promise<TaskListResult> {
    const rows = (await couchDB.queryView<string, null, TaskDocument>('firn-tasks', 'pool', {
      include_docs: true
    })).rows
    const docs = rows
      .map(r => r.doc)
      .filter((d): d is TaskDocument => !!d && d.type === 'task')
      .filter(d => d.responsibleUsers.length === 0 && !d.archivedAt && d.status === 'open' && d.visibility === 'public')
    return TaskService.paginateAndProject(actor, docs, options)
  },

  /* Tasks linked to a project, addressed by its LIMS project id. */
  async listByProject(actor: FirnUser, projectId: string, options: TaskListOptions = {}): Promise<TaskListResult> {
    return TaskService.listByLinkView(actor, 'by_project', await resolveProjectDocId(projectId), options)
  },

  /* Tasks linked to an inventory object, addressed by its kind and slug. */
  async listByInventory(
    actor: FirnUser,
    kind: TaskInventoryContextKind,
    slug: string,
    options: TaskListOptions = {}
  ): Promise<TaskListResult> {
    return TaskService.listByLinkView(actor, 'by_inventory', await resolveInventoryDocId(kind, slug), options)
  },

  async listByLinkView(
    actor: FirnUser,
    view: 'by_project' | 'by_inventory',
    key: string,
    options: TaskListOptions
  ): Promise<TaskListResult> {
    const rows = (await couchDB.queryView<string, null>('firn-tasks', view, { key })).rows
    const ids = [...new Set(rows.map(r => r.id).filter((id): id is string => !!id))]
    const docs = (await couchDB.getDocumentsByIds<TaskDocument>(ids))
      .filter((d): d is TaskDocument => !!d && d.type === 'task')
      .filter(d => options.includeArchived ? true : !d.archivedAt)
      .filter(d => resolveTaskRole(d, actor) !== null)
    return TaskService.paginateAndProject(actor, docs, options)
  },

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /* Write an updated task guarding against concurrent edits via its _rev. */
  async writeWithCas(previous: TaskDocument, updated: TaskDocument): Promise<TaskDocument> {
    try {
      const result = await couchDB.updateDocument(previous._id, updated, previous._rev)
      return { ...updated, _id: result.id, _rev: result.rev }
    }
    catch (error) {
      if (isCouchConflict(error)) throw new TaskConflictError()
      throw error
    }
  },

  /* Stable priority/date ordering, then bounded pagination and client-safe projection. */
  async paginateAndProject(
    actor: FirnUser,
    docs: TaskDocument[],
    options: TaskListOptions
  ): Promise<TaskListResult> {
    const now = DateTime.now()
    const quadrantRank: Record<string, number> = {
      important_urgent: 0,
      important_not_urgent: 1,
      ordinary_urgent: 2,
      ordinary_not_urgent: 3
    }
    const sorted = [...docs].sort((a, b) => {
      const qa = quadrantRank[computeQuadrant(a.importance, computeUrgency(a, now).urgency)] ?? 99
      const qb = quadrantRank[computeQuadrant(b.importance, computeUrgency(b, now).urgency)] ?? 99
      if (qa !== qb) return qa - qb
      const da = a.dueDate ?? '\uffff'
      const db = b.dueDate ?? '\uffff'
      if (da !== db) return da < db ? -1 : 1
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
      return a.slug < b.slug ? -1 : 1
    })

    const limit = clampPageSize(options.limit)
    const offset = Math.max(0, options.offset ?? 0)
    const page = sorted.slice(offset, offset + limit)
    const tasks = await Promise.all(page.map(async (task) => {
      const steps = await TaskService.getStepsForTask(task._id)
      return TaskService.toDisplayTask(task, actor, steps)
    }))
    return { tasks, total: sorted.length }
  },

  /* Build the client-safe projection of a task (no CouchDB _id, resolved display refs). */
  async toDisplayTask(task: TaskDocument, actor: FirnUser, steps: TaskStepDocument[]): Promise<DisplayTask> {
    const now = DateTime.now()
    const { urgency, reason: urgencyReason } = computeUrgency(task, now)
    // Activations only matter where they can block an action: to members of an unarchived task.
    const mayBeBlocked = !task.archivedAt && canExecuteTask(task, actor)
    const [creator, managingOwner, responsibleUsers, viewers, activations] = await Promise.all([
      toDisplayActor(task.creator),
      toDisplayActor(task.managingOwner),
      resolveUserRefs(task.responsibleUsers),
      resolveUserRefs(task.viewers),
      mayBeBlocked ? loadActivationsForTask(task._id) : []
    ])
    return {
      slug: task.slug,
      title: task.title,
      description: task.description,
      creator,
      managingOwner,
      responsibleUsers,
      viewers,
      visibility: task.visibility,
      status: task.status,
      importance: task.importance,
      urgency,
      urgencyReason,
      quadrant: computeQuadrant(task.importance, urgency),
      dueDate: task.dueDate,
      projectRefs: task.projectRefs ? task.projectRefs.map(r => refToEntityStub(r, 'project')) : null,
      inventoryRefs: task.inventoryRefs
        ? task.inventoryRefs.map(r => refToEntityStub(r, inventoryKind(r.type)))
        : null,
      progress: summarizeProgress(steps),
      viewerRole: resolveTaskRole(task, actor) ?? 'public',
      actions: taskActionsFor(task, actor, activations),
      editVersion: task.editVersion,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt,
      archivedAt: task.archivedAt
    }
  }
}

/* Map an inventory document discriminator to a SerializedEntityRef kind. */
export function inventoryKind(type: string | undefined): SerializedEntityRef['kind'] {
  switch (type) {
    case 'inventoryItem': return 'item'
    case 'container': return 'container'
    case 'storageEquipment': return 'equipment'
    case 'room': return 'room'
    default: return 'container'
  }
}
