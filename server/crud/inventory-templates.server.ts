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
 * getTemplates(templateFor?) - List templates, optionally filtered by templateFor
 * updateTemplate(templateId, rev, updates, userId) - Update template metadata/defaults
 * deleteTemplate(templateId, rev) - Delete a template document
 * applyTemplate(templateId) - Convert template defaults to equipment/container/item create payload
 */

import { couchDB } from '../database/couchdb'
import { generateCouchDocId } from './inventory-helpers.server'
import type {
  CreateContainerInput,
  CreateInventoryItemInput,
  CreateInventoryTemplateInput,
  CreateStorageEquipmentInput,
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
      slug: generateCouchDocId('template'),
      name: input.name,
      description: input.description ?? null,
      templateFor: input.templateFor,
      defaultCategory: input.defaultCategory ?? null,
      defaultClassification: input.defaultClassification ?? null,
      rows: input.rows ?? null,
      columns: input.columns ?? null,
      levels: input.levels ?? null,
      capacity: input.capacity ?? null,
      reservedPositions: input.reservedPositions ?? [],
      acceptedItemCategories: input.acceptedItemCategories ?? null,
      acceptedContainerCategories: input.acceptedContainerCategories ?? null,
      defaultColor: input.defaultColor ?? null,
      defaultUnit: input.defaultUnit ?? null,
      defaultConcentrationUnit: input.defaultConcentrationUnit ?? null,
      metadata: input.metadata ?? null,
      isActive: input.isActive ?? true,
      createdBy: userId,
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
  async getTemplates(templateFor?: InventoryTemplate['templateFor']): Promise<InventoryTemplate[]> {
    const selector: Record<string, unknown> = { type: 'inventoryTemplate' }

    if (templateFor) {
      selector.templateFor = templateFor
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

    const updatedTemplate: InventoryTemplate = {
      ...existingTemplate,
      type: 'inventoryTemplate',
      schema: 1,
      name: updates.name ?? existingTemplate.name,
      description: updates.description !== undefined ? updates.description : existingTemplate.description,
      templateFor: updates.templateFor ?? existingTemplate.templateFor,
      defaultCategory: updates.defaultCategory !== undefined ? updates.defaultCategory : existingTemplate.defaultCategory,
      defaultClassification: updates.defaultClassification !== undefined ? updates.defaultClassification : existingTemplate.defaultClassification,
      rows: updates.rows !== undefined ? updates.rows : existingTemplate.rows,
      columns: updates.columns !== undefined ? updates.columns : existingTemplate.columns,
      levels: updates.levels !== undefined ? updates.levels : existingTemplate.levels,
      capacity: updates.capacity !== undefined ? updates.capacity : existingTemplate.capacity,
      reservedPositions: updates.reservedPositions ?? existingTemplate.reservedPositions,
      acceptedItemCategories: updates.acceptedItemCategories !== undefined ? updates.acceptedItemCategories : existingTemplate.acceptedItemCategories,
      acceptedContainerCategories: updates.acceptedContainerCategories !== undefined ? updates.acceptedContainerCategories : existingTemplate.acceptedContainerCategories,
      defaultColor: updates.defaultColor !== undefined ? updates.defaultColor : existingTemplate.defaultColor,
      defaultUnit: updates.defaultUnit !== undefined ? updates.defaultUnit : existingTemplate.defaultUnit,
      defaultConcentrationUnit: updates.defaultConcentrationUnit !== undefined ? updates.defaultConcentrationUnit : existingTemplate.defaultConcentrationUnit,
      metadata: updates.metadata !== undefined ? updates.metadata : existingTemplate.metadata,
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

  /* Map template defaults into create payloads for equipment, container, or item workflows. */
  async applyTemplate(templateId: string): Promise<Partial<CreateStorageEquipmentInput> | Partial<CreateContainerInput> | Partial<CreateInventoryItemInput>> {
    const template = ensureTemplate(await couchDB.getDocument<InventoryTemplate>(templateId), templateId)

    if (template.templateFor === 'storageEquipment') {
      const payload: Partial<CreateStorageEquipmentInput> = {
        equipmentType: (template.defaultCategory as CreateStorageEquipmentInput['equipmentType']) ?? undefined,
        rows: template.rows ?? undefined,
        columns: template.columns ?? undefined,
        levels: template.levels ?? undefined,
        capacity: template.capacity ?? undefined,
        isActive: template.isActive
      }
      return payload
    }

    if (template.templateFor === 'container') {
      const payload: Partial<CreateContainerInput> = {
        containerType: (template.defaultCategory as CreateContainerInput['containerType']) ?? undefined,
        classification: (template.defaultClassification as CreateContainerInput['classification']) ?? undefined,
        rows: template.rows ?? undefined,
        columns: template.columns ?? undefined,
        levels: template.levels ?? undefined,
        capacity: template.capacity ?? undefined,
        acceptedItemCategories: template.acceptedItemCategories ?? undefined,
        acceptedContainerCategories: template.acceptedContainerCategories ?? undefined,
        color: template.defaultColor ?? undefined,
        isActive: template.isActive
      }
      return payload
    }

    const payload: Partial<CreateInventoryItemInput> = {
      category: (template.defaultCategory as CreateInventoryItemInput['category']) ?? undefined,
      classification: (template.defaultClassification as CreateInventoryItemInput['classification']) ?? undefined,
      unit: template.defaultUnit ?? undefined,
      concentrationUnit: template.defaultConcentrationUnit ?? undefined,
      metadata: template.metadata ?? undefined
    }
    return payload
  }
}
