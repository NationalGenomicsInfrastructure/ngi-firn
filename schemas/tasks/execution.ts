import { z } from 'zod'
import { taskExecutionSourceSchema, taskReconcileResultSchema } from './enums'
import {
  activationIdSchema,
  firnIdSchema,
  operationIdSchema,
  optionalNoteSchema,
  stepIdSchema
} from './common'

/*
 * Inputs of the lab-work workflows: activation, confirmation, skipping and recovery. Every
 * workflow carries a caller-supplied `operationId`, so a retried request replays its stored result
 * instead of running twice (see server/crud/tasks/operations.server.ts).
 */

/* Executor-reported occurrence time (may be backdated for paper work); server time when omitted. */
const reportedAtSchema = z.iso.datetime({ offset: true, message: 'Reported time must be an ISO 8601 timestamp' }).nullish()

/* Activate a subset of planned steps; their unresolved prerequisites are included automatically. */
export const activateStepsSchema = z.object({
  stepIds: z.array(stepIdSchema).min(1, { message: 'Select at least one step to activate' }),
  operationId: operationIdSchema
})

const stepExecutionBase = {
  stepId: stepIdSchema,
  activationId: activationIdSchema,
  operationId: operationIdSchema,
  source: taskExecutionSourceSchema,
  reportedAt: reportedAtSchema,
  notes: optionalNoteSchema
}

/* Confirm that a held step was physically carried out. */
export const confirmStepSchema = z.object(stepExecutionBase)

/* Record that a held step was deliberately not carried out. */
export const skipStepSchema = z.object(stepExecutionBase)

/* Confirm several held steps of one activation in dependency order. */
export const confirmBatchSchema = z.object({
  activationId: activationIdSchema,
  operationId: operationIdSchema,
  source: taskExecutionSourceSchema,
  reportedAt: reportedAtSchema,
  /* Steps to confirm; omit to confirm every still-held step of the activation. */
  stepIds: z.array(stepIdSchema).optional()
})

/* Per-step declaration of what physically happened, required to cancel an activation. */
export const cancelStepDeclarationSchema = z.object({
  stepId: stepIdSchema,
  /* True when the physical work was already carried out outside the confirm flow. */
  physicallyPerformed: z.boolean()
})

export const cancelActivationSchema = z.object({
  activationId: activationIdSchema,
  operationId: operationIdSchema,
  reason: z.string().trim().min(1, { message: 'A reason is required to cancel activated work' }),
  declarations: z.array(cancelStepDeclarationSchema)
})

/* Pass an activation to another responsible colleague. */
export const handoverSchema = z.object({
  activationId: activationIdSchema,
  operationId: operationIdSchema,
  toExecutorFirnId: firnIdSchema,
  /* The current executor's explicit acknowledgement that physical progress is reconciled. */
  acknowledged: z.boolean()
})

/* The true outcome of a step in a needs_reconciliation activation. */
export const reconcileStepResolutionSchema = z.object({
  stepId: stepIdSchema,
  result: taskReconcileResultSchema
})

export const reconcileSchema = z.object({
  activationId: activationIdSchema,
  operationId: operationIdSchema,
  resolutions: z.array(reconcileStepResolutionSchema).min(1, { message: 'Resolve at least one step' })
})

/* Address a single activation of a task. */
export const activationByIdSchema = z.object({
  activationId: activationIdSchema
})

export type ActivateStepsSchemaInput = z.infer<typeof activateStepsSchema>
export type ConfirmStepSchemaInput = z.infer<typeof confirmStepSchema>
export type SkipStepSchemaInput = z.infer<typeof skipStepSchema>
export type ConfirmBatchSchemaInput = z.infer<typeof confirmBatchSchema>
export type CancelStepDeclarationSchemaInput = z.infer<typeof cancelStepDeclarationSchema>
export type CancelActivationSchemaInput = z.infer<typeof cancelActivationSchema>
export type HandoverSchemaInput = z.infer<typeof handoverSchema>
export type ReconcileStepResolutionSchemaInput = z.infer<typeof reconcileStepResolutionSchema>
export type ReconcileSchemaInput = z.infer<typeof reconcileSchema>
export type ActivationByIdSchemaInput = z.infer<typeof activationByIdSchema>
