import { z } from 'zod'
import { inventoryActionSchema } from '../inventory/metadata'

/*
 * Task enums that reach the client, as procedure input or as output the UI renders or filters on.
 * They are defined once here; types/productivity.d.ts derives its types from them via z.infer and
 * re-exports them. Backend-internal enums (operation, reservation and reminder states) stay static.
 */

/* Who may read a task. `public` means every approved application user, not anonymous internet. */
export const taskVisibilitySchema = z.enum(['private', 'public'])

/*
 * Aggregate task lifecycle. `open` covers preliminary, partly activated and partly resolved work;
 * per-step and per-activation state is tracked on the respective documents, never inferred from
 * this field. `archivedAt` is an independent axis, not a status.
 */
export const taskStatusSchema = z.enum(['draft', 'open', 'completed', 'cancelled'])

/* Task-level importance axis of the two-dimensional priority model. */
export const taskImportanceSchema = z.enum(['important', 'ordinary'])

/* Computed urgency axis: a task is urgent when due today or overdue in Europe/Stockholm. */
export const taskUrgencySchema = z.enum(['urgent', 'not_urgent'])

/* The four priority quadrants derived from importance × urgency. */
export const taskQuadrantSchema = z.enum([
  'important_urgent',
  'important_not_urgent',
  'ordinary_urgent',
  'ordinary_not_urgent'
])

/*
 * Per-step lifecycle. A step is `planned` until an activation acquires its holds (`held`), is
 * `executing` while a confirmation operation runs, then reaches a terminal `completed`/`skipped`/
 * `cancelled`. A failed or ambiguous operation enters `needs_reconciliation` and keeps its
 * protective holds until a human resolves it.
 */
export const taskStepStateSchema = z.enum([
  'planned',
  'held',
  'executing',
  'completed',
  'skipped',
  'cancelled',
  'needs_reconciliation'
])

/* Terminal result recorded for a resolved step. */
export const taskStepResultSchema = z.enum(['completed', 'skipped', 'cancelled', 'failed'])

/* The true outcome an executor declares when reconciling a step: done, or not done. */
export const taskReconcileResultSchema = taskStepResultSchema.extract(['completed', 'skipped'])

/* How the executor reported a step outcome. */
export const taskExecutionSourceSchema = z.enum(['scanner', 'paper', 'online'])

/* Lifecycle of an activation (a frozen, held unit of selected executable work). */
export const taskActivationStateSchema = z.enum([
  'preparing',
  'active',
  'finished',
  'cancelling',
  'cancelled',
  'needs_reconciliation'
])

/* Role of the requesting user relative to a task, used to drive client affordances. */
export const taskViewerRoleSchema = z.enum(['owner', 'responsible', 'viewer', 'public'])

/*
 * Per-step disposition returned by a batch confirmation. `already_resolved` covers a step that was
 * terminal before the batch ran; `blocked` covers an unmet dependency; `failed`/`needs_reconciliation`
 * surface execution errors without aborting the remaining steps.
 */
export const taskBatchStepStatusSchema = z.enum([
  'completed',
  'skipped',
  'already_resolved',
  'blocked',
  'failed',
  'needs_reconciliation'
])

/* The inventory actions a task step can plan (dispose is item-only, enforced by the step schema). */
export const taskInventoryActionSchema = inventoryActionSchema.extract(['checkout', 'return', 'move', 'locate', 'dispose'])

export type TaskVisibility = z.infer<typeof taskVisibilitySchema>
export type TaskStatus = z.infer<typeof taskStatusSchema>
export type TaskImportance = z.infer<typeof taskImportanceSchema>
export type TaskUrgency = z.infer<typeof taskUrgencySchema>
export type TaskQuadrant = z.infer<typeof taskQuadrantSchema>
export type TaskStepState = z.infer<typeof taskStepStateSchema>
export type TaskStepResult = z.infer<typeof taskStepResultSchema>
export type TaskReconcileResult = z.infer<typeof taskReconcileResultSchema>
export type TaskExecutionSource = z.infer<typeof taskExecutionSourceSchema>
export type TaskActivationState = z.infer<typeof taskActivationStateSchema>
export type DisplayTaskViewerRole = z.infer<typeof taskViewerRoleSchema>
export type TaskBatchStepStatus = z.infer<typeof taskBatchStepStatusSchema>
export type TaskInventoryAction = z.infer<typeof taskInventoryActionSchema>
