<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { StorageEquipment } from '~~/types/inventory'
import { containersByParentQuery } from '~/utils/queries/inventory/containers'
import { itemsByParentQuery } from '~/utils/queries/inventory/items'
import { deleteEquipment as useDeleteEquipmentMutation } from '~/utils/mutations/inventory/rooms'

const props = defineProps<{
  equipment: StorageEquipment
  roomDocumentId: string
}>()

const { state: containersState, asyncStatus: containersStatus } = useQueryColada(
  () => containersByParentQuery(props.equipment._id)
)

const { state: itemsState, asyncStatus: itemsStatus } = useQueryColada(
  () => itemsByParentQuery(props.equipment._id)
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

  const { deleteEquipment } = useDeleteEquipmentMutation()
  deleteEquipment({
    id: props.equipment._id,
    rev: props.equipment._rev,
    equipmentName: props.equipment.name,
    roomDocumentId: props.roomDocumentId
  })
}
</script>

<template>
  <NDialog
    title="Delete equipment"
    description="Are you sure you want to delete this storage equipment?"
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
        This will permanently remove <span class="font-semibold text-error">{{ equipment.name }}</span> ({{ equipment.equipmentId }}) from inventory.
      </p>
      <p
        v-if="hasChildren"
        class="text-muted"
      >
        This equipment still has
        <span class="font-semibold text-error">{{ childCount }}</span>
        direct children ({{ childContainers.length }} containers and {{ childItems.length }} items). Move or remove child inventory first.
      </p>
      <p
        v-else
        class="text-muted"
      >
        Equipment can only be deleted when it has no direct child containers or items.
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
            label="Delete equipment"
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
