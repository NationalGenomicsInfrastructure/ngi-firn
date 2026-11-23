import { z } from 'zod'
import { entityKindSchema } from '../basic'
import { gridPositionSchema } from '../inventory/grid'

/*
 * Building blocks shared by the task input schemas.
 *
 * The wire format addresses everything by its public identity: tasks by slug, steps by stepId,
 * activations by activationId, inventory objects by kind + slug and projects by their LIMS project
 * id. CouchDB ids never cross the wire; server/crud/tasks/references.server.ts resolves these
 * public identifiers to stored references.
 */

/* Default and upper bound for task listing page sizes. */
export const TASK_PAGE_SIZE = 50
export const TASK_MAX_PAGE_SIZE = 200

export const taskSlugSchema = z.string().min(1, { message: 'Task identifier is required' })
export const stepIdSchema = z.string().min(1, { message: 'Step identifier is required' })
export const activationIdSchema = z.string().min(1, { message: 'Activation identifier is required' })

/*
 * Caller-supplied idempotency key of a workflow request (the client sends crypto.randomUUID()).
 * It becomes part of a CouchDB document id (`task-op:<operationId>`), hence the restricted alphabet.
 */
export const operationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, {
  message: 'Operation id must be 8-128 characters of letters, digits, "-" or "_".'
})

/* A firnId of a colleague (sharing, ownership transfer, handover). */
export const firnIdSchema = z.string().min(1, { message: 'User identifier is required' }).max(5, { message: 'Invalid user identifier' })

/* Optional free-text note; services store a missing or blank note as null. */
export const optionalNoteSchema = z.string().trim().nullish()

/*
 * Scope a body schema to a task. Services keep their `(actor, taskSlug, input)` signature and take
 * the body type; the router validates the body plus the task slug in one input.
 */
export function withTaskSlug<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  return schema.extend({ taskSlug: taskSlugSchema })
}

/* Paging options of every task listing. */
export const taskListOptionsSchema = z.object({
  limit: z.number().int().min(1).max(TASK_MAX_PAGE_SIZE).optional(),
  offset: z.number().int().min(0).optional(),
  includeArchived: z.boolean().optional()
})

// ---------------------------------------------------------------------------------------------
// Public references
// ---------------------------------------------------------------------------------------------

/* The object an inventory step acts on. */
export const taskTargetKindSchema = entityKindSchema.extract(['container', 'item'])

/* Where a move/locate step puts its object: a storage equipment or a container, never a room. */
export const taskDestinationKindSchema = entityKindSchema.extract(['equipment', 'container'])

/* Inventory objects a task may link to for context (they never acquire holds). */
export const taskInventoryContextKindSchema = entityKindSchema.extract(['container', 'equipment', 'item', 'room'])

/* Anything a free-text step may reference for context, including projects. */
export const taskContextKindSchema = entityKindSchema.extract(['container', 'equipment', 'item', 'room', 'project'])

const slugSchema = z.string().trim().min(1, { message: 'Identifier is required' })

export const taskInventoryContextRefSchema = z.object({
  kind: taskInventoryContextKindSchema,
  slug: slugSchema
})

/* A context reference; for `kind: 'project'` the slug is the LIMS project id. */
export const taskContextRefSchema = z.object({
  kind: taskContextKindSchema,
  slug: slugSchema
})

export const taskDestinationInputSchema = z.object({
  kind: taskDestinationKindSchema,
  slug: slugSchema,
  /* Exact grid cell; leave empty to have a free cell picked and reserved at activation. */
  position: gridPositionSchema.nullish()
})

export type TaskListOptions = z.infer<typeof taskListOptionsSchema>
export type TaskTargetKind = z.infer<typeof taskTargetKindSchema>
export type TaskDestinationKind = z.infer<typeof taskDestinationKindSchema>
export type TaskInventoryContextKind = z.infer<typeof taskInventoryContextKindSchema>
export type TaskContextKind = z.infer<typeof taskContextKindSchema>
export type TaskInventoryContextRefInput = z.infer<typeof taskInventoryContextRefSchema>
export type TaskContextRefInput = z.infer<typeof taskContextRefSchema>
export type TaskDestinationInput = z.infer<typeof taskDestinationInputSchema>
