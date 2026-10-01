import { defineMutation, useMutation, useQueryCache } from '@pinia/colada'
import type { ProjectLinkBatchInput, ProjectLinkResult } from '~~/schemas/inventory/projectLinks'
import { INVENTORY_CONTAINERS_QUERY_KEYS } from '~/utils/queries/inventory/containers'
import { INVENTORY_ITEMS_QUERY_KEYS } from '~/utils/queries/inventory/items'
import { INVENTORY_PROJECT_LINKS_QUERY_KEYS } from '~/utils/queries/inventory/projectLinks'

const { showSuccess, showError, showWarning } = useFirnToast()

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// One summary toast for the whole batch.
function report(verb: 'linked' | 'unlinked', projectId: string, result: ProjectLinkResult) {
  const title = verb === 'linked' ? 'Project linked' : 'Project unlinked'
  const preposition = verb === 'linked' ? 'to' : 'from'
  if (result.failed.length > 0) {
    showWarning(
      `${plural(result.changed.length, 'entity')} ${verb}, ${result.failed.length} failed (${result.failed.map(f => f.slug).join(', ')}).`,
      title
    )
  }
  else if (result.changed.length === 0) {
    showSuccess(`Nothing to do: all selected entities were already ${verb === 'linked' ? 'linked' : 'unlinked'}.`, title)
  }
  else {
    showSuccess(`${plural(result.changed.length, 'entity')} ${verb} ${preposition} project "${projectId}".`, title)
  }
}

function invalidate(projectId: string) {
  const queryCache = useQueryCache()
  queryCache.invalidateQueries({ key: INVENTORY_PROJECT_LINKS_QUERY_KEYS.byProject(projectId) })
  queryCache.invalidateQueries({ key: INVENTORY_ITEMS_QUERY_KEYS.root })
  queryCache.invalidateQueries({ key: INVENTORY_CONTAINERS_QUERY_KEYS.root })
}

export const linkEntitiesToProject = defineMutation(() => {
  const { mutateAsync, ...mutation } = useMutation({
    mutation: (input: ProjectLinkBatchInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.projectLinks.linkEntities.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Project could not be linked')
    },
    onSuccess(result, input) {
      report('linked', input.projectId, result)
    },
    onSettled(_data, _error, input) {
      invalidate(input.projectId)
    }
  })
  return { linkEntitiesToProject: mutateAsync, ...mutation }
})

export const unlinkEntitiesFromProject = defineMutation(() => {
  const { mutateAsync, ...mutation } = useMutation({
    mutation: (input: ProjectLinkBatchInput) => {
      const { $trpc } = useNuxtApp()
      return $trpc.inventory.projectLinks.unlinkEntities.mutate(input)
    },
    onError(error: Error) {
      showError(error.message, 'Project could not be unlinked')
    },
    onSuccess(result, input) {
      report('unlinked', input.projectId, result)
    },
    onSettled(_data, _error, input) {
      invalidate(input.projectId)
    }
  })
  return { unlinkEntitiesFromProject: mutateAsync, ...mutation }
})
