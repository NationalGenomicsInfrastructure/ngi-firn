/*
 * Inventory Templates Router - Table of Contents
 * **********************************************
 *
 * QUERIES (authedProcedure):
 * getTemplate - Fetch a single template by ID
 * getTemplates - List templates, optionally filtered by kind
 * applyTemplate - Return pre-filled defaults from a template
 *
 * MUTATIONS (authedProcedure):
 * createTemplate - Create a reusable template
 * updateTemplate - Update template fields
 *
 * MUTATIONS (adminProcedure):
 * deleteTemplate - Delete a template
 */

import { createTRPCRouter, authedProcedure, adminProcedure } from '../../init'
import { z } from 'zod'
import {
  createTemplateSchema,
  updateTemplateSchema,
  deleteTemplateSchema,
  applyTemplateSchema,
  getTemplatesSchema
} from '~~/schemas/inventory-templates'
import type { InventoryTemplate } from '~~/types/inventory'

export const templatesRouter = createTRPCRouter({

  // Queries

  getTemplate: authedProcedure
    .input(z.object({ templateId: z.string().min(1) }))
    .query(async ({ input }): Promise<InventoryTemplate | null> => {
      const { TemplateService } = await import('../../../crud/inventory-templates.server')
      return TemplateService.getTemplate(input.templateId)
    }),

  getTemplates: authedProcedure
    .input(getTemplatesSchema)
    .query(async ({ input }): Promise<InventoryTemplate[]> => {
      const { TemplateService } = await import('../../../crud/inventory-templates.server')
      return TemplateService.getTemplates(input.templateFor)
    }),

  // Mutations

  createTemplate: authedProcedure
    .input(createTemplateSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTemplate> => {
      const { TemplateService } = await import('../../../crud/inventory-templates.server')
      return TemplateService.createTemplate(input, ctx.secure!.id)
    }),

  updateTemplate: authedProcedure
    .input(updateTemplateSchema)
    .mutation(async ({ input, ctx }): Promise<InventoryTemplate> => {
      const { TemplateService } = await import('../../../crud/inventory-templates.server')
      const { id, rev } = input
      return TemplateService.updateTemplate(id, rev, input, ctx.secure!.id)
    }),

  applyTemplate: authedProcedure
    .input(applyTemplateSchema)
    .query(async ({ input }) => {
      const { TemplateService } = await import('../../../crud/inventory-templates.server')
      return TemplateService.applyTemplate(input.templateId)
    }),

  deleteTemplate: adminProcedure
    .input(deleteTemplateSchema)
    .mutation(async ({ input }): Promise<void> => {
      const { TemplateService } = await import('../../../crud/inventory-templates.server')
      return TemplateService.deleteTemplate(input.id, input.rev)
    })
})
