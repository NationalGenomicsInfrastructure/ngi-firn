import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { InventoryTemplate } from '~~/types/inventory'
import type {
  CreateTemplateSchemaInput,
  UpdateTemplateSchemaInput
} from '~~/schemas/inventory-templates'
import { INVENTORY_TEMPLATES_QUERY_KEYS } from '~/utils/queries/inventory/templates'

const { showSuccess, showError } = useFirnToast()

type DeleteTemplateInput = { id: string, rev: string, templateName?: string }

// Template creation

export const createTemplate = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: CreateTemplateSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.templates.createTemplate.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Template could not be created')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Template "${input.name}" created successfully.`,
        'Template created'
      )
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_TEMPLATES_QUERY_KEYS.root })
    }
  })
  return { createTemplate: mutate, ...mutation }
})

// Template update

export const updateTemplate = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: UpdateTemplateSchemaInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.templates.updateTemplate.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Template could not be updated')
    },
    onSuccess() {
      showSuccess('Template updated successfully.', 'Template updated')
    },
    onSettled(_data, _error, input) {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({
        key: INVENTORY_TEMPLATES_QUERY_KEYS.template(input.id),
        exact: true
      })
      queryCache.invalidateQueries({ key: INVENTORY_TEMPLATES_QUERY_KEYS.root })
    }
  })
  return { updateTemplate: mutate, ...mutation }
})

// Template deletion

export const deleteTemplate = defineMutation(() => {
  const { mutate, ...mutation } = useMutation({
    mutation: (input: DeleteTemplateInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.templates.deleteTemplate.mutate({ id: input.id, rev: input.rev })
    },
    onMutate(input) {
      const queryCache = useQueryCache()
      const templates = queryCache.getQueryData<InventoryTemplate[]>(
        INVENTORY_TEMPLATES_QUERY_KEYS.list()
      ) || []
      queryCache.cancelQueries({
        key: INVENTORY_TEMPLATES_QUERY_KEYS.list(),
        exact: true
      })
      queryCache.setQueryData(
        INVENTORY_TEMPLATES_QUERY_KEYS.list(),
        templates.filter(t => t._id !== input.id)
      )
      return { templates }
    },
    onError(error: Error, _input, context) {
      const queryCache = useQueryCache()
      queryCache.setQueryData(
        INVENTORY_TEMPLATES_QUERY_KEYS.list(),
        context.templates ?? []
      )
      showError(error.message, 'Template could not be deleted')
    },
    onSuccess(_data, input) {
      showSuccess(
        `Template${input.templateName ? ` "${input.templateName}"` : ''} deleted successfully.`,
        'Template deleted'
      )
    },
    onSettled() {
      const queryCache = useQueryCache()
      queryCache.invalidateQueries({ key: INVENTORY_TEMPLATES_QUERY_KEYS.root })
    }
  })
  return { deleteTemplate: mutate, ...mutation }
})
