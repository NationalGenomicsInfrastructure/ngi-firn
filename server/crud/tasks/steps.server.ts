/*
 * TaskStepService - actor-aware CRUD for the individually-stored steps of a task.
 *
 * Steps are separate documents so editing or appending one never rewrites the whole task. Steps
 * carry no sharing fields; authorization is derived from the parent task. Structural edits (add,
 * update, remove, reorder, set dependencies) are owner-only and permitted only while a step is
 * still `planned`; an active executable definition is never edited in place.
 *
 * Like the task service, these operations perform NO inventory mutation. Storing an inventory step
 * records intent only; it does not move, reserve, or otherwise touch the referenced objects.
 */
import { DateTime } from 'luxon'

import { couchDB, generateCouchDocId } from '../../database/couchdb'
import type { FirnUser } from '../../../types/auth'
import type { SerializedEntityRef } from '../../../types/inventory'
import type {
  DisplayTaskInventoryObjectRef,
  DisplayTaskStep,
  DisplayTaskStepPayload,
  TaskInventoryObjectRef,
  TaskStepDocument,
  TaskStepPayload
} from '../../../types/productivity'
import {
  TaskForbiddenError,
  TaskNotFoundError,
  TaskValidationError,
  assertCanManage,
  resolveUserRefs
} from './common'
import { TaskService } from './tasks.server'

/** A step definition as supplied by a caller (server assigns id/order/state/version). */
export interface StepDefinitionInput {
  payload: TaskStepPayload
  dependsOn?: string[]
}

function generateStepId(): string {
  return `stp_${DateTime.now().toMillis().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/* Validate a single step payload's runtime shape (the compiler enforces it for typed callers). */
function validatePayload(payload: TaskStepPayload): void {
  if (!payload || typeof payload !== 'object') {
    throw new TaskValidationError('A step payload is required.')
  }
  if (payload.kind === 'text') {
    if (!payload.title?.trim()) throw new TaskValidationError('A text step requires a title.')
    return
  }
  if (payload.kind === 'inventory') {
    if (!payload.target?.ref?.id) throw new TaskValidationError('An inventory step requires a target reference.')
    if (payload.action === 'dispose' && payload.targetKind !== 'item') {
      throw new TaskValidationError('Only items can be disposed.')
    }
    if ((payload.action === 'move' || payload.action === 'locate')) {
      if (!payload.destination?.parent?.ref?.id) {
        throw new TaskValidationError(`A "${payload.action}" step requires a destination.`)
      }
    }
    return
  }
  throw new TaskValidationError('Unknown step payload kind.')
}

/*
 * Validate a prospective dependency graph: every dependency references a known step in the same
 * task, no step depends on itself, and the graph is acyclic. Throws TaskValidationError otherwise.
 */
function validateDependencyGraph(adjacency: Map<string, string[]>): void {
  for (const [stepId, deps] of adjacency) {
    for (const dep of deps) {
      if (dep === stepId) throw new TaskValidationError(`Step "${stepId}" cannot depend on itself.`)
      if (!adjacency.has(dep)) {
        throw new TaskValidationError(`Step "${stepId}" depends on unknown step "${dep}".`)
      }
    }
  }
  // Iterative DFS cycle detection with white/grey/black colouring.
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const colour = new Map<string, number>()
  for (const id of adjacency.keys()) colour.set(id, WHITE)

  const dfs = (start: string): void => {
    const stack: Array<{ node: string, iter: number }> = [{ node: start, iter: 0 }]
    colour.set(start, GREY)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const deps = adjacency.get(frame.node) ?? []
      if (frame.iter < deps.length) {
        const next = deps[frame.iter]!
        frame.iter++
        const c = colour.get(next)
        if (c === GREY) throw new TaskValidationError('Step dependencies form a cycle.')
        if (c === WHITE) {
          colour.set(next, GREY)
          stack.push({ node: next, iter: 0 })
        }
      }
      else {
        colour.set(frame.node, BLACK)
        stack.pop()
      }
    }
  }
  for (const id of adjacency.keys()) {
    if (colour.get(id) === WHITE) dfs(id)
  }
}

export const TaskStepService = {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async listSteps(actor: FirnUser, slug: string): Promise<DisplayTaskStep[]> {
    const task = await TaskService.requireReadableTask(actor, slug)
    const steps = await TaskService.getStepsForTask(task._id)
    return Promise.all(steps.map(step => TaskStepService.toDisplayStep(step)))
  },

  async getStepDoc(taskId: string, stepId: string): Promise<TaskStepDocument | null> {
    const steps = await TaskService.getStepsForTask(taskId)
    return steps.find(s => s.stepId === stepId) ?? null
  },

  // -------------------------------------------------------------------------
  // Structural edits (owner-only; planned steps only)
  // -------------------------------------------------------------------------

  async addSteps(actor: FirnUser, slug: string, definitions: StepDefinitionInput[]): Promise<TaskStepDocument[]> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManage(task, actor)
    if (definitions.length === 0) return []

    const existing = await TaskService.getStepsForTask(task._id)
    const adjacency = new Map<string, string[]>()
    for (const step of existing) adjacency.set(step.stepId, step.dependsOn)

    const now = DateTime.now().toISO()
    let order = existing.reduce((max, s) => Math.max(max, s.order), -1)
    const prepared: Array<Omit<TaskStepDocument, '_id' | '_rev'>> = []
    for (const def of definitions) {
      validatePayload(def.payload)
      const stepId = generateStepId()
      order += 1
      const dependsOn = [...new Set(def.dependsOn ?? [])]
      adjacency.set(stepId, dependsOn)
      prepared.push({
        type: 'taskStep',
        schema: 1,
        stepId,
        task: { db: 'firn', id: task._id, type: 'task' },
        order,
        dependsOn,
        payload: def.payload,
        state: 'planned',
        definitionVersion: 1,
        outcome: null,
        createdAt: now,
        updatedAt: now
      })
    }
    // Validate the whole prospective graph before writing anything.
    validateDependencyGraph(adjacency)

    const created: TaskStepDocument[] = []
    for (const doc of prepared) {
      const result = await couchDB.createDocument({ ...doc, _id: generateCouchDocId('task-step') })
      const readBack = await couchDB.getDocument<TaskStepDocument>(result.id)
      if (readBack) created.push(readBack)
    }
    return created
  },

  async updatePlannedStep(
    actor: FirnUser,
    slug: string,
    stepId: string,
    patch: { payload?: TaskStepPayload, dependsOn?: string[] }
  ): Promise<TaskStepDocument> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManage(task, actor)
    const steps = await TaskService.getStepsForTask(task._id)
    const step = steps.find(s => s.stepId === stepId)
    if (!step) throw new TaskNotFoundError('Step not found.')
    if (step.state !== 'planned') {
      throw new TaskForbiddenError('Only planned steps can be edited; create a corrective step instead.')
    }

    const nextDependsOn = patch.dependsOn !== undefined ? [...new Set(patch.dependsOn)] : step.dependsOn
    if (patch.payload) validatePayload(patch.payload)

    const adjacency = new Map<string, string[]>()
    for (const s of steps) adjacency.set(s.stepId, s.stepId === stepId ? nextDependsOn : s.dependsOn)
    validateDependencyGraph(adjacency)

    const updated: TaskStepDocument = {
      ...step,
      payload: patch.payload ?? step.payload,
      dependsOn: nextDependsOn,
      definitionVersion: step.definitionVersion + 1,
      updatedAt: DateTime.now().toISO()
    }
    const result = await couchDB.updateDocument(step._id, updated, step._rev)
    return { ...updated, _id: result.id, _rev: result.rev }
  },

  async setDependencies(actor: FirnUser, slug: string, stepId: string, dependsOn: string[]): Promise<TaskStepDocument> {
    return TaskStepService.updatePlannedStep(actor, slug, stepId, { dependsOn })
  },

  async removePlannedStep(actor: FirnUser, slug: string, stepId: string): Promise<void> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManage(task, actor)
    const steps = await TaskService.getStepsForTask(task._id)
    const step = steps.find(s => s.stepId === stepId)
    if (!step) throw new TaskNotFoundError('Step not found.')
    if (step.state !== 'planned') {
      throw new TaskForbiddenError('Only unexecuted planned steps can be removed; cancel executed work instead.')
    }
    // Removing a step that others depend on would dangle their dependencies.
    const dependents = steps.filter(s => s.stepId !== stepId && s.dependsOn.includes(stepId))
    if (dependents.length > 0) {
      throw new TaskValidationError(
        `Cannot remove step "${stepId}"; it is required by: ${dependents.map(d => d.stepId).join(', ')}.`
      )
    }
    await couchDB.deleteDocument(step._id, step._rev)
  },

  async reorderSteps(actor: FirnUser, slug: string, orderedStepIds: string[]): Promise<TaskStepDocument[]> {
    const task = await TaskService.requireReadableTask(actor, slug)
    assertCanManage(task, actor)
    const steps = await TaskService.getStepsForTask(task._id)
    const byId = new Map(steps.map(s => [s.stepId, s]))
    if (orderedStepIds.length !== steps.length || !orderedStepIds.every(id => byId.has(id))) {
      throw new TaskValidationError('Reorder must list every step of the task exactly once.')
    }
    if (new Set(orderedStepIds).size !== orderedStepIds.length) {
      throw new TaskValidationError('Reorder contains duplicate step ids.')
    }
    const now = DateTime.now().toISO()
    const updated: TaskStepDocument[] = []
    for (let index = 0; index < orderedStepIds.length; index++) {
      const step = byId.get(orderedStepIds[index]!)!
      if (step.order === index) {
        updated.push(step)
        continue
      }
      const next: TaskStepDocument = { ...step, order: index, updatedAt: now }
      const result = await couchDB.updateDocument(step._id, next, step._rev)
      updated.push({ ...next, _id: result.id, _rev: result.rev })
    }
    return updated.sort((a, b) => a.order - b.order)
  },

  // -------------------------------------------------------------------------
  // Projection
  // -------------------------------------------------------------------------

  async toDisplayStep(step: TaskStepDocument): Promise<DisplayTaskStep> {
    const payload = projectPayload(step.payload)
    let outcome: DisplayTaskStep['outcome'] = null
    if (step.outcome) {
      const performedBy = step.outcome.performedBy
        ? (await resolveUserRefs([step.outcome.performedBy]))[0] ?? null
        : null
      outcome = {
        result: step.outcome.result,
        performedBy,
        performedAt: step.outcome.performedAt,
        recordedAt: step.outcome.recordedAt,
        source: step.outcome.source,
        notes: step.outcome.notes,
        failureReason: step.outcome.failureReason
      }
    }
    return {
      stepId: step.stepId,
      order: step.order,
      dependsOn: step.dependsOn,
      payload,
      state: step.state,
      definitionVersion: step.definitionVersion,
      outcome,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt
    }
  },

  // Re-exported for callers that already hold a task document.
  _internal: { validateDependencyGraph, validatePayload }
}

function objectRefToStub(ref: TaskInventoryObjectRef, kind: SerializedEntityRef['kind']): DisplayTaskInventoryObjectRef {
  return {
    entity: { slug: ref.slug, name: ref.name, kind },
    pathLabel: ref.pathLabel
  }
}

/* Project a stored step payload into its client-safe display form. */
function projectPayload(payload: TaskStepPayload): DisplayTaskStepPayload {
  if (payload.kind === 'text') {
    return {
      kind: 'text',
      title: payload.title,
      body: payload.body,
      contextRefs: payload.contextRefs
        ? payload.contextRefs.map(r => ({ slug: r.slug ?? r.id, name: r.name ?? r.slug ?? r.id, kind: 'container' as const }))
        : null
    }
  }
  const targetKind: SerializedEntityRef['kind'] = payload.targetKind === 'item' ? 'item' : 'container'
  const destination = payload.action === 'move' || payload.action === 'locate'
    ? {
        parent: objectRefToStub(payload.destination.parent, destinationKind(payload.destination.parent.ref.type)),
        position: payload.destination.position
      }
    : null
  return {
    kind: 'inventory',
    action: payload.action,
    targetKind: payload.targetKind,
    target: objectRefToStub(payload.target, targetKind),
    destination,
    expectedStatus: payload.expectedStatus,
    notes: payload.notes
  }
}

function destinationKind(type: string | undefined): SerializedEntityRef['kind'] {
  switch (type) {
    case 'storageEquipment': return 'equipment'
    case 'room': return 'room'
    case 'inventoryItem': return 'item'
    default: return 'container'
  }
}
