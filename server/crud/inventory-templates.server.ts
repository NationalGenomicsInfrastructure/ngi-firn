/*
 * TemplateService - Table of Contents
 * **********************************
 *
 * INTERNAL HELPERS:
 * ensureTemplate(doc, templateId) - Validate loaded template documents
 *
 * TEMPLATE CRUD:
 * createTemplate(input, userId) - Create a reusable inventory template
 * getTemplate(templateId) - Fetch one template
 * getTemplates(templateFor?) - List templates, optionally filtered by target type
 * updateTemplate(templateId, rev, updates, userId) - Update template metadata/defaults
 * deleteTemplate(templateId, rev) - Delete a template document
 * applyTemplate(templateId) - Convert template defaults to container/item create payload
 */

import { couchDB } from '../database/couchdb'
import type {
  CreateContainerInput,
  CreateInventoryItemInput,
  CreateInventoryTemplateInput,
  InventoryTemplate,
  UpdateInventoryTemplateInput
} from '../../types/inventory'

/* Ensure fetched template exists and has the expected document type. */
function ensureTemplate(doc: InventoryTemplate | null, templateId: string): InventoryTemplate {
  if (!doc || doc.type !== 'inventoryTemplate') {
    throw new Error(`Inventory template ${templateId} was not found.`)
  }

  return doc
}

export const TemplateService = {
  /* Create a new reusable template with persisted audit metadata. */
  async createTemplate(input: CreateInventoryTemplateInput, userId: string): Promise<InventoryTemplate> {
    if (!userId) {
      throw new Error('A user ID is required to create an inventory template.')
    }

    const now = new Date().toISOString()
    const newTemplate: Omit<InventoryTemplate, '_id' | '_rev'> = {
      type: 'inventoryTemplate',
      schema: 1,
      templateId: input.templateId,
      name: input.name,
      description: input.description ?? null,
      appliesTo: input.appliesTo,
      containerType: input.containerType ?? null,
      rows: input.rows,
      columns: input.columns,
      levels: input.levels ?? 1,
      reservedPositions: input.reservedPositions ?? [],
      metadata: input.metadata ?? { createdBy: userId, updatedBy: userId },
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now
    }

    const result = await couchDB.createDocument(newTemplate)
    const created = await couchDB.getDocument<InventoryTemplate>(result.id)
    return ensureTemplate(created, result.id)
  },

  /* Fetch one inventory template by document ID. */
  async getTemplate(templateId: string): Promise<InventoryTemplate | null> {
    const doc = await couchDB.getDocument<InventoryTemplate>(templateId)
    if (!doc || doc.type !== 'inventoryTemplate') {
      return null
    }

    return doc
  },

  /* List templates, optionally constrained to one template target kind. */
  async getTemplates(templateFor?: InventoryTemplate['appliesTo']): Promise<InventoryTemplate[]> {
    const selector: Record<string, unknown> = { type: 'inventoryTemplate' }

    if (templateFor) {
      selector.appliesTo = templateFor
    }

    const templates = await couchDB.queryDocuments<InventoryTemplate>(selector)

    return templates
      .filter(template => template.type === 'inventoryTemplate')
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  /* Update a template and preserve revision-controlled writes. */
  async updateTemplate(
    templateId: string,
    rev: string,
    updates: UpdateInventoryTemplateInput,
    userId: string
  ): Promise<InventoryTemplate> {
    if (!userId) {
      throw new Error('A user ID is required to update an inventory template.')
    }

    const existingTemplate = ensureTemplate(await couchDB.getDocument<InventoryTemplate>(templateId), templateId)

    const now = new Date().toISOString()
    const metadata = updates.metadata !== undefined
      ? updates.metadata
      : existingTemplate.metadata

    const updatedTemplate: InventoryTemplate = {
      ...existingTemplate,
      type: 'inventoryTemplate',
      schema: 1,
      templateId: updates.templateId ?? existingTemplate.templateId,
      name: updates.name ?? existingTemplate.name,
      description: updates.description ?? existingTemplate.description,
      appliesTo: updates.appliesTo ?? existingTemplate.appliesTo,
      containerType: updates.containerType !== undefined
        ? updates.containerType
        : existingTemplate.containerType,
      rows: updates.rows ?? existingTemplate.rows,
      columns: updates.columns ?? existingTemplate.columns,
      levels: updates.levels ?? existingTemplate.levels,
      reservedPositions: updates.reservedPositions ?? existingTemplate.reservedPositions,
      metadata: metadata == null ? metadata : { ...metadata, updatedBy: userId },
      isActive: updates.isActive ?? existingTemplate.isActive,
      updatedAt: now
    }

    const result = await couchDB.updateDocument(templateId, updatedTemplate, rev)

    return {
      ...updatedTemplate,
      _id: result.id,
      _rev: result.rev
    }
  },

  /* Delete a template by document ID/revision. */
  async deleteTemplate(templateId: string, rev: string): Promise<void> {
    await couchDB.deleteDocument(templateId, rev)
  },

  /* Map template defaults into create payloads for container or item workflows. */
  async applyTemplate(templateId: string): Promise<Partial<CreateContainerInput> | Partial<CreateInventoryItemInput>> {
    const template = ensureTemplate(await couchDB.getDocument<InventoryTemplate>(templateId), templateId)

    if (template.appliesTo === 'storageEquipment') {
      return {
        name: template.name,
        label: template.name,
        description: template.description ?? undefined,
        containerType: template.containerType ?? 'other',
        rows: template.rows,
        columns: template.columns,
        levels: template.levels,
        capacity: template.rows * template.columns * Math.max(template.levels, 1),
        isActive: template.isActive
      }
    }

    return {
      name: template.name,
      label: template.name,
      description: template.description ?? undefined,
      itemType: 'other',
      metadata: {
        ...(template.metadata ?? {}),
        templateId: template.templateId,
        templateName: template.name,
        templateGrid: {
          rows: template.rows,
          columns: template.columns,
          levels: template.levels,
          reservedPositions: template.reservedPositions
        }
      }
    }
  }
}
