/*
 * Inventory Tasks Router - Table of Contents
 * ******************************************
 *
 * QUERIES (authedProcedure):
 * getTask - Fetch a single task by ID
 * getTasksForTarget - List tasks for a specific entity
 * getPlannedTasks - List planned tasks with optional filters
 * getOverdueTasks - List tasks past their due date
 *
 * MUTATIONS (authedProcedure):
 * createTask - Create a planned task
 * completeTask - Complete a task (appends log entry to target)
 * skipTask - Skip a task with optional reason
 *
 * MUTATIONS (tokenProcedure):
 * completeTaskByToken - Complete task via tablet
 * skipTaskByToken - Skip task via tablet
 *
 * MUTATIONS (adminProcedure):
 * cancelTask - Cancel a task (authoritative override)
 * createExpiryTasks - Batch-create expiry disposal tasks
 */

import { createTRPCRouter, authedProcedure, adminProcedure, tokenProcedure } from '../../init'
import { z } from 'zod'
import {
  createTaskSchema,
  completeTaskSchema,
  skipTaskSchema,
  cancelTaskSchema,
  getTasksForTargetSchema,
  getPlannedTasksSchema,
  createExpiryTasksSchema
} from '~~/schemas/inventory-tasks'
import type { InventoryTask } from '~~/types/inventory'

export const tasksRouter = createTRPCRouter({

  // Queries (authedProcedure)

  getTask: authedProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryTask | null> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.getTask(input.taskId)
    }),

  getTasksForTarget: authedProcedure
    .input(getTasksForTargetSchema)
    .query(async ({ input }): Promise<InventoryTask[]> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.getTasksForTarget(input.targetId, input.limit)
    }),

  getPlannedTasks: authedProcedure
    .input(getPlannedTasksSchema)
    .query(async ({ input }): Promise<InventoryTask[]> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.getPlannedTasks(input)
    }),

  getOverdueTasks: authedProcedure
    .query(async (): Promise<InventoryTask[]> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.getOverdueTasks()
    }),

  // Mutations (authedProcedure)

  createTask: authedProcedure
    .input(createTaskSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTask> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.createTask(input, ctx.secure!.id)
    }),

  completeTask: authedProcedure
    .input(completeTaskSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTask> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.completeTask(input.taskId, ctx.secure!.id, input.notes)
    }),

  skipTask: authedProcedure
    .input(skipTaskSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTask> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.skipTask(input.taskId, ctx.secure!.id, input.reason)
    }),

  // Mutations (tokenProcedure — tablet workflows)

  completeTaskByToken: tokenProcedure
    .input(completeTaskSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTask> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.completeTask(input.taskId, ctx.secure!.id, input.notes)
    }),

  skipTaskByToken: tokenProcedure
    .input(skipTaskSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTask> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.skipTask(input.taskId, ctx.secure!.id, input.reason)
    }),

  // Mutations (adminProcedure — authoritative overrides)

  cancelTask: adminProcedure
    .input(cancelTaskSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTask> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.cancelTask(input.taskId, ctx.secure!.id)
    }),

  createExpiryTasks: adminProcedure
    .input(createExpiryTasksSchema)
    .mutation(async ({ input }): Promise<InventoryTask[]> => {
      const { TaskService } = await import('../../../crud/inventory-tasks.server')
      return TaskService.createExpiryTasks(input.beforeDate)
    })
})
