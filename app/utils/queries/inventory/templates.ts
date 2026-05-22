import type { z } from 'zod'
import type { templateForSchema } from '~~/schemas/inventory-common'
import { defineQueryOptions } from '@pinia/colada'

type TemplateFor = z.infer<typeof templateForSchema>

// Key factory for inventory templates domain
export const INVENTORY_TEMPLATES_QUERY_KEYS = {
  root: ['inventory', 'templates'] as const,
  template: (templateId: string) => [...INVENTORY_TEMPLATES_QUERY_KEYS.root, 'template', templateId] as const,
  list: (templateFor?: string) => [...INVENTORY_TEMPLATES_QUERY_KEYS.root, 'list', templateFor ?? 'all'] as const
} as const

// Query for a single template by ID
export const templateQuery = defineQueryOptions(
  (templateId: string) => ({
    key: INVENTORY_TEMPLATES_QUERY_KEYS.template(templateId),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.templates.getTemplate.query({ templateId })
    }
  })
)

// Query for templates, optionally filtered by target type
export const templatesQuery = defineQueryOptions(
  (templateFor?: TemplateFor) => ({
    key: INVENTORY_TEMPLATES_QUERY_KEYS.list(templateFor),
    query: () => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.templates.getTemplates.query({ templateFor })
    }
  })
)
