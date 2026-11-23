import { z } from 'zod'
import { inventoryStatusSchema } from '../inventory/metadata'
import {
  optionalNoteSchema,
  stepIdSchema,
  taskContextRefSchema,
  taskDestinationInputSchema,
  taskTargetKindSchema
} from './common'

/*
 * Step definitions as a client submits them. Inventory objects are addressed by kind + slug; the
 * server resolves them to stored references and captures display snapshots (name, path) when the
 * step is planned. Impossible action/target combinations are rejected here: `dispose` takes items
 * only, `move`/`locate` require a destination, and destinations are never rooms.
 */

const slugSchema = z.string().trim().min(1, { message: 'Inventory identifier is required' })

/* A container or an item the step acts on. */
const containerOrItemTargetSchema = z.object({
  kind: taskTargetKindSchema,
  slug: slugSchema
})

/* Only items can be disposed. */
const itemTargetSchema = z.object({
  kind: z.literal('item'),
  slug: slugSchema
})

const inventoryStepBase = {
  kind: z.literal('inventory'),
  /* Lifecycle state the planner expects the target to be in; validated at activation. */
  expectedStatus: inventoryStatusSchema.nullish(),
  notes: optionalNoteSchema
}

export const inventoryStepPayloadInputSchema = z.discriminatedUnion('action', [
  z.object({ ...inventoryStepBase, action: z.literal('checkout'), target: containerOrItemTargetSchema }),
  z.object({ ...inventoryStepBase, action: z.literal('return'), target: containerOrItemTargetSchema }),
  z.object({
    ...inventoryStepBase,
    action: z.literal('move'),
    target: containerOrItemTargetSchema,
    destination: taskDestinationInputSchema
  }),
  z.object({
    ...inventoryStepBase,
    action: z.literal('locate'),
    target: containerOrItemTargetSchema,
    destination: taskDestinationInputSchema
  }),
  z.object({ ...inventoryStepBase, action: z.literal('dispose'), target: itemTargetSchema })
])

/* Free-text ToDo step, optionally referencing inventory or projects for context (never reserving). */
export const textStepPayloadInputSchema = z.object({
  kind: z.literal('text'),
  title: z.string().trim().min(1, { message: 'A text step requires a title' }),
  body: optionalNoteSchema,
  contextRefs: z.array(taskContextRefSchema).nullish()
})

export const stepPayloadInputSchema = z.discriminatedUnion('kind', [
  textStepPayloadInputSchema,
  inventoryStepPayloadInputSchema
])

/* A step to append; the server assigns its id, order, state and version. */
export const stepDefinitionInputSchema = z.object({
  payload: stepPayloadInputSchema,
  /* stepIds of existing prerequisite steps of the same task. */
  dependsOn: z.array(stepIdSchema).optional()
})

export const addStepsSchema = z.object({
  steps: z.array(stepDefinitionInputSchema).min(1, { message: 'At least one step is required' })
})

/* Edit a planned step; only the provided fields change. */
export const updatePlannedStepSchema = z.object({
  stepId: stepIdSchema,
  payload: stepPayloadInputSchema.optional(),
  dependsOn: z.array(stepIdSchema).optional()
})

export const setStepDependenciesSchema = z.object({
  stepId: stepIdSchema,
  dependsOn: z.array(stepIdSchema)
})

export const removePlannedStepSchema = z.object({
  stepId: stepIdSchema
})

/* Every step of the task, each exactly once, in the new checklist order. */
export const reorderStepsSchema = z.object({
  orderedStepIds: z.array(stepIdSchema)
})

export type InventoryStepPayloadInput = z.infer<typeof inventoryStepPayloadInputSchema>
export type TextStepPayloadInput = z.infer<typeof textStepPayloadInputSchema>
export type StepPayloadInput = z.infer<typeof stepPayloadInputSchema>
export type StepDefinitionSchemaInput = z.infer<typeof stepDefinitionInputSchema>
export type AddStepsSchemaInput = z.infer<typeof addStepsSchema>
export type UpdatePlannedStepSchemaInput = z.infer<typeof updatePlannedStepSchema>
export type SetStepDependenciesSchemaInput = z.infer<typeof setStepDependenciesSchema>
export type RemovePlannedStepSchemaInput = z.infer<typeof removePlannedStepSchema>
export type ReorderStepsSchemaInput = z.infer<typeof reorderStepsSchema>
