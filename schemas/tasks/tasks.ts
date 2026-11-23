import { z } from 'zod'
import { taskImportanceSchema, taskVisibilitySchema } from './enums'
import {
  firnIdSchema,
  taskInventoryContextKindSchema,
  taskInventoryContextRefSchema,
  taskListOptionsSchema,
  taskSlugSchema
} from './common'

/*
 * Inputs of the task aggregate: creation, metadata, sharing, ownership and listings.
 * Users are addressed by firnId, projects by LIMS project id and inventory by kind + slug.
 */

const titleSchema = z.string().trim().min(1, { message: 'A task title is required' })
const descriptionSchema = z.string().nullish()
/* Calendar due date (YYYY-MM-DD), interpreted in Europe/Stockholm. */
const dueDateSchema = z.iso.date({ message: 'Due date must be a calendar date (YYYY-MM-DD)' }).nullish()

/* Create a task. The creator becomes its managing owner and the task starts as a draft. */
export const createTaskSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  visibility: taskVisibilitySchema.optional(),
  importance: taskImportanceSchema.optional(),
  dueDate: dueDateSchema,
  responsibleFirnIds: z.array(firnIdSchema).optional(),
  viewerFirnIds: z.array(firnIdSchema).optional(),
  /* LIMS project ids of the projects this task belongs to. */
  projectIds: z.array(z.string().trim().min(1)).optional(),
  /* Inventory the task concerns; contextual only, links never reserve anything. */
  inventoryRefs: z.array(taskInventoryContextRefSchema).optional()
})

/* Patch task metadata; only the provided fields change. */
export const updateTaskMetadataSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema,
  importance: taskImportanceSchema.optional(),
  dueDate: dueDateSchema,
  /* When provided, the update fails with a conflict if the task was edited in the meantime. */
  expectedEditVersion: z.number().int().min(1).optional()
})

/* Patch sharing; omitted fields are left unchanged. */
export const setSharingSchema = z.object({
  visibility: taskVisibilitySchema.optional(),
  responsibleFirnIds: z.array(firnIdSchema).optional(),
  viewerFirnIds: z.array(firnIdSchema).optional()
})

export const transferOwnershipSchema = z.object({
  newOwnerFirnId: firnIdSchema
})

/* Address a single task. */
export const taskBySlugSchema = z.object({
  taskSlug: taskSlugSchema
})

export const listTasksSchema = taskListOptionsSchema

export const listTasksByProjectSchema = taskListOptionsSchema.extend({
  projectId: z.string().trim().min(1, { message: 'LIMS project identifier is required' })
})

export const listTasksByInventorySchema = taskListOptionsSchema.extend({
  kind: taskInventoryContextKindSchema,
  slug: z.string().trim().min(1, { message: 'Inventory identifier is required' })
})

export type CreateTaskSchemaInput = z.infer<typeof createTaskSchema>
export type UpdateTaskMetadataSchemaInput = z.infer<typeof updateTaskMetadataSchema>
export type SetSharingSchemaInput = z.infer<typeof setSharingSchema>
export type TransferOwnershipSchemaInput = z.infer<typeof transferOwnershipSchema>
export type TaskBySlugSchemaInput = z.infer<typeof taskBySlugSchema>
export type ListTasksByProjectSchemaInput = z.infer<typeof listTasksByProjectSchema>
export type ListTasksByInventorySchemaInput = z.infer<typeof listTasksByInventorySchema>
