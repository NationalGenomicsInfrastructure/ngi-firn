/*
 * Task Activations Router - Table of Contents
 * *******************************************
 *
 * All procedures use taskProcedure. Every workflow mutation carries a client-generated
 * `operationId`, so a retried request replays its stored result instead of running twice.
 *
 * QUERIES:
 * list - Every activation of a task
 * get - One activation by activationId
 *
 * MUTATIONS:
 * activate - Freeze selected planned steps and acquire their inventory holds
 * confirmStep / skipStep - Record a held step as performed / deliberately not performed
 * confirmBatch - Confirm several held steps in dependency order
 * cancel - Abandon an activation, declaring per step what physically happened
 * handover - Pass an activation to another responsible colleague
 * reconcile - Resolve a needs_reconciliation activation step by step
 */

import { createTRPCRouter } from '../../init'
import { taskProcedure } from './procedure'
import { withTaskSlug } from '~~/schemas/tasks/common'
import { taskBySlugSchema } from '~~/schemas/tasks/tasks'
import {
  activateStepsSchema,
  activationByIdSchema,
  cancelActivationSchema,
  confirmBatchSchema,
  confirmStepSchema,
  handoverSchema,
  reconcileSchema,
  skipStepSchema
} from '~~/schemas/tasks/execution'
import type { DisplayTaskActivation, DisplayTaskBatchResult, DisplayTaskStep } from '~~/types/productivity'

async function activationService() {
  return (await import('../../../crud/tasks/activation.server')).TaskActivationService
}

async function executionService() {
  return (await import('../../../crud/tasks/execution.server')).TaskExecutionService
}

async function recoveryService() {
  return (await import('../../../crud/tasks/recovery.server')).TaskRecoveryService
}

export const taskActivationsRouter = createTRPCRouter({

  // Queries

  list: taskProcedure
    .input(taskBySlugSchema)
    .query(async ({ input, ctx }): Promise<DisplayTaskActivation[]> => {
      return (await activationService()).listActivations(ctx.firnUser, input.taskSlug)
    }),

  get: taskProcedure
    .input(withTaskSlug(activationByIdSchema))
    .query(async ({ input, ctx }): Promise<DisplayTaskActivation> => {
      return (await activationService()).getActivation(ctx.firnUser, input.taskSlug, input.activationId)
    }),

  // Activation and execution

  activate: taskProcedure
    .input(withTaskSlug(activateStepsSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskActivation> => {
      return (await activationService()).activateSteps(ctx.firnUser, taskSlug, body)
    }),

  confirmStep: taskProcedure
    .input(withTaskSlug(confirmStepSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskStep> => {
      return (await executionService()).confirmStep(ctx.firnUser, taskSlug, body)
    }),

  skipStep: taskProcedure
    .input(withTaskSlug(skipStepSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskStep> => {
      return (await executionService()).skipStep(ctx.firnUser, taskSlug, body)
    }),

  confirmBatch: taskProcedure
    .input(withTaskSlug(confirmBatchSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskBatchResult> => {
      return (await executionService()).confirmBatch(ctx.firnUser, taskSlug, body)
    }),

  // Recovery

  cancel: taskProcedure
    .input(withTaskSlug(cancelActivationSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskActivation> => {
      return (await recoveryService()).cancelActivation(ctx.firnUser, taskSlug, body)
    }),

  handover: taskProcedure
    .input(withTaskSlug(handoverSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskActivation> => {
      return (await recoveryService()).handover(ctx.firnUser, taskSlug, body)
    }),

  reconcile: taskProcedure
    .input(withTaskSlug(reconcileSchema))
    .mutation(async ({ input: { taskSlug, ...body }, ctx }): Promise<DisplayTaskActivation> => {
      return (await recoveryService()).reconcile(ctx.firnUser, taskSlug, body)
    })
})
