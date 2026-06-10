<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { Container } from '~~/types/inventory'
import { containersByParentQuery } from '~/utils/queries/inventory/containers'
import { itemsByParentQuery } from '~/utils/queries/inventory/items'
import { deleteContainer as useDeleteContainerMutation } from '~/utils/mutations/inventory/containers'

const props = defineProps<{
  container: Container
  parentDocumentId?: string
}>()

const { state: containersState, asyncStatus: containersStatus } = useQueryColada(
  () => containersByParentQuery(props.container._id)
)

const { state: itemsState, asyncStatus: itemsStatus } = useQueryColada(
  () => itemsByParentQuery(props.container._id)
)

const childContainers = computed(() =>
  containersState.value.status === 'success' ? containersState.value.data : []
)

const childItems = computed(() =>
  itemsState.value.status === 'success' ? itemsState.value.data : []
)

const childCount = computed(() => childContainers.value.length + childItems.value.length)
const isCheckingChildren = computed(() => containersStatus.value === 'loading' || itemsStatus.value === 'loading')
const hasChildren = computed(() => childCount.value > 0)
const isDeleteDisabled = computed(() => isCheckingChildren.value || hasChildren.value)

const deleteButtonLabel = computed(() => {
  if (isCheckingChildren.value) {
    return 'Checking...'
  }
  if (hasChildren.value) {
    return 'Cannot delete with child inventory'
  }
  return 'Delete'
})

function handleDelete() {
  if (isDeleteDisabled.value) {
    return
  }

  const { deleteContainer } = useDeleteContainerMutation()
  deleteContainer({
    id: props.container._id,
    rev: props.container._rev,
    containerName: props.container.name,
    parentId: props.parentDocumentId
  })
}
</script>

<template>
  <NDialog
    title="Delete container"
    description="Are you sure you want to delete this container?"
  >
    <template #trigger>
      <NButton
        :label="deleteButtonLabel"
        size="sm"
        btn="soft-error hover:outline-error"
        :leading="isDeleteDisabled ? 'i-lucide-ban' : 'i-lucide-trash-2'"
        :disabled="isDeleteDisabled"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This will permanently remove <span class="font-semibold text-error">{{ container.name }}</span> ({{ container.slug }}) from inventory.
      </p>
      <p
        v-if="hasChildren"
        class="text-muted"
      >
        This container still has
        <span class="font-semibold text-error">{{ childCount }}</span>
        direct children ({{ childContainers.length }} containers and {{ childItems.length }} items). Move or remove child inventory first.
      </p>
      <p
        v-else
        class="text-muted"
      >
        Containers can only be deleted when they have no direct child containers or items.
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <NDialogClose>
          <NButton
            label="Delete container"
            btn="soft-error hover:outline-error"
            leading="i-lucide-trash-2"
            :disabled="isDeleteDisabled"
            @click="handleDelete"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
