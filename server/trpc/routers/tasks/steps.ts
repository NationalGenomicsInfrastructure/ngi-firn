/*
 * Task Steps Router - Table of Contents
 * *************************************
 *
 * All procedures use taskProcedure. Structural edits are owner-only and limited to planned steps;
 * the services enforce both.
 *
 * QUERIES:
 * list - Every step of a task in checklist order
 *
 * MUTATIONS:
 * add - Append steps (inventory addressed by kind + slug)
 * update - Edit a planned step's payload and/or dependencies
 * setDependencies - Replace a planned step's prerequisites
 * remove - Delete a planned step nothing depends on
 * reorder - Set the checklist order of every step
 */

import { createTRPCRouter } from '../../init'
import { taskProcedure } from './procedure'
import { withTaskSlug } from '~~/schemas/tasks/common'
import { taskBySlugSchema } from '~~/schemas/tasks/tasks'
import {
  addStepsSchema,
  removePlannedStepSchema,
  reorderStepsSchema,
  setStepDependenciesSchema,
  updatePlannedStepSchema
} from '~~/schemas/tasks/steps'
import type { DisplayTaskStep, TaskStepDocument } from '~~/types/productivity'

async function stepService() {
  return (await import('../../../crud/tasks/steps.server')).TaskStepService
}

/* Project stored steps (as returned by a mutation) to their client-safe form. */
async function toDisplaySteps(steps: TaskStepDocument[]): Promise<DisplayTaskStep[]> {
  const TaskStepService = await stepService()
  return Promise.all(steps.map(step => TaskStepService.toDisplayStep(step)))
}

export const taskStepsRouter = createTRPCRouter({

  list: taskProcedure
    .input(taskBySlugSchema)
    .query(async ({ input, ctx }): Promise<DisplayTaskStep[]> => {
      return (await stepService()).listSteps(ctx.firnUser, input.taskSlug)
    }),

  add: taskProcedure
    .input(withTaskSlug(addStepsSchema))
    .mutation(async ({ input, ctx }): Promise<DisplayTaskStep[]> => {
      return toDisplaySteps(await (await stepService()).addSteps(ctx.firnUser, input.taskSlug, input.steps))
    }),

  update: taskProcedure
    .input(withTaskSlug(updatePlannedStepSchema))
    .mutation(async ({ input: { taskSlug, stepId, ...patch }, ctx }): Promise<DisplayTaskStep> => {
      const step = await (await stepService()).updatePlannedStep(ctx.firnUser, taskSlug, stepId, patch)
      const [display] = await toDisplaySteps([step])
      return display!
    }),

  setDependencies: taskProcedure
    .input(withTaskSlug(setStepDependenciesSchema))
    .mutation(async ({ input, ctx }): Promise<DisplayTaskStep> => {
      const step = await (await stepService()).setDependencies(ctx.firnUser, input.taskSlug, input.stepId, input.dependsOn)
      const [display] = await toDisplaySteps([step])
      return display!
    }),

  remove: taskProcedure
    .input(withTaskSlug(removePlannedStepSchema))
    .mutation(async ({ input, ctx }): Promise<{ stepId: string }> => {
      await (await stepService()).removePlannedStep(ctx.firnUser, input.taskSlug, input.stepId)
      return { stepId: input.stepId }
    }),

  reorder: taskProcedure
    .input(withTaskSlug(reorderStepsSchema))
    .mutation(async ({ input, ctx }): Promise<DisplayTaskStep[]> => {
      return toDisplaySteps(await (await stepService()).reorderSteps(ctx.firnUser, input.taskSlug, input.orderedStepIds))
    })
})
