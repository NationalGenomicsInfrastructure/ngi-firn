/*
 * Tasks Router - Table of Contents
 * ********************************
 *
 * All procedures use taskProcedure (authenticated Firn user, task errors mapped to tRPC codes).
 * Authorization is enforced inside the services; the router only validates and projects.
 *
 * QUERIES:
 * list - Tasks the user can see (owned, responsible, viewer or public)
 * listPool - Public, open, unassigned tasks available for claiming
 * listByProject - Tasks linked to a project (LIMS project id)
 * listByInventory - Tasks linked to an inventory object (kind + slug)
 * getBySlug - One task
 *
 * MUTATIONS:
 * create, updateMetadata, setSharing, publish, transferOwnership, archive, cancel
 * claim, releaseResponsibility
 */

import { createTRPCRouter } from '../../init'
import { taskProcedure } from './procedure'
import { withTaskSlug } from '~~/schemas/tasks/common'
import {
  createTaskSchema,
  listTasksByInventorySchema,
  listTasksByProjectSchema,
  listTasksSchema,
  setSharingSchema,
  taskBySlugSchema,
  transferOwnershipSchema,
  updateTaskMetadataSchema
} from '~~/schemas/tasks/tasks'
import type { TaskListResult as TaskListPage } from '../../../crud/tasks/tasks.server'
import type { FirnUser } from '~~/types/auth'
import type { DisplayTask, TaskDocument } from '~~/types/productivity'

async function taskService() {
  return (await import('../../../crud/tasks/tasks.server')).TaskService
}

/* Project a stored task (as returned by a mutation) to its client-safe form for the actor. */
async function toDisplay(task: TaskDocument, actor: FirnUser): Promise<DisplayTask> {
  const TaskService = await taskService()
  return TaskService.toDisplayTask(task, actor, await TaskService.getStepsForTask(task._id))
}

export const tasksRouter = createTRPCRouter({

  // Queries

  list: taskProcedure
    .input(listTasksSchema)
    .query(async ({ input, ctx }): Promise<TaskListPage> => {
      return (await taskService()).listForUser(ctx.firnUser, input)
    }),

  listPool: taskProcedure
    .input(listTasksSchema)
    .query(async ({ input, ctx }): Promise<TaskListPage> => {
      return (await taskService()).listPool(ctx.firnUser, input)
    }),

  listByProject: taskProcedure
    .input(listTasksByProjectSchema)
    .query(async ({ input: { projectId, ...options }, ctx }): Promise<TaskListPage> => {
      return (await taskService()).listByProject(ctx.firnUser, projectId, options)
    }),

  listByInventory: taskProcedure
    .input(listTasksByInventorySchema)
    .query(async ({ input: { kind, slug, ...options }, ctx }): Promise<TaskListPage> => {
      return (await taskService()).listByInventory(ctx.firnUser, kind, slug, options)
    }),

  getBySlug: taskProcedure
    .input(taskBySlugSchema)
    .query(async ({ input, ctx }): Promise<DisplayTask> => {
      return (await taskService()).getDisplayTask(ctx.firnUser, input.taskSlug)
    }),

  // Mutations

  create: taskProcedure
    .input(createTaskSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).createTask(ctx.firnUser, input), ctx.firnUser)
    }),

  updateMetadata: taskProcedure
    .input(withTaskSlug(updateTaskMetadataSchema))
    .mutation(async ({ input: { taskSlug, ...patch }, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).updateMetadata(ctx.firnUser, taskSlug, patch), ctx.firnUser)
    }),

  setSharing: taskProcedure
    .input(withTaskSlug(setSharingSchema))
    .mutation(async ({ input: { taskSlug, ...sharing }, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).setSharing(ctx.firnUser, taskSlug, sharing), ctx.firnUser)
    }),

  publish: taskProcedure
    .input(taskBySlugSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).publishTask(ctx.firnUser, input.taskSlug), ctx.firnUser)
    }),

  transferOwnership: taskProcedure
    .input(withTaskSlug(transferOwnershipSchema))
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      const task = await (await taskService()).transferOwnership(ctx.firnUser, input.taskSlug, input.newOwnerFirnId)
      return toDisplay(task, ctx.firnUser)
    }),

  archive: taskProcedure
    .input(taskBySlugSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).archiveTask(ctx.firnUser, input.taskSlug), ctx.firnUser)
    }),

  cancel: taskProcedure
    .input(taskBySlugSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).cancelTask(ctx.firnUser, input.taskSlug), ctx.firnUser)
    }),

  claim: taskProcedure
    .input(taskBySlugSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).claimTask(ctx.firnUser, input.taskSlug), ctx.firnUser)
    }),

  releaseResponsibility: taskProcedure
    .input(taskBySlugSchema)
    .mutation(async ({ input, ctx }): Promise<DisplayTask> => {
      return toDisplay(await (await taskService()).releaseResponsibility(ctx.firnUser, input.taskSlug), ctx.firnUser)
    })
})
