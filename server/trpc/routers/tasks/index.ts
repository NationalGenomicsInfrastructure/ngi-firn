/*
 * Tasks Router - Aggregation Index
 * ********************************
 *
 * Registered in the main firnRouter as `tasks`:
 *   tasks.*             - the task aggregate (tasks.ts)
 *   tasks.steps.*       - planning the checklist (steps.ts)
 *   tasks.activations.* - activation, execution and recovery of held work (activations.ts)
 *
 * Inputs are the Zod schemas in schemas/tasks; domain errors are mapped to tRPC codes by
 * taskProcedure (procedure.ts).
 */

import { createTRPCRouter, mergeTRPCRouters } from '../../init'
import { tasksRouter as taskAggregateRouter } from './tasks'
import { taskStepsRouter } from './steps'
import { taskActivationsRouter } from './activations'

export const tasksRouter = mergeTRPCRouters(
  taskAggregateRouter,
  createTRPCRouter({
    steps: taskStepsRouter,
    activations: taskActivationsRouter
  })
)
