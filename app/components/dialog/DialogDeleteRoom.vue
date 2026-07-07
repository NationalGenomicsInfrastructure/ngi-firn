<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayRoom } from '~~/types/inventory'
import { deleteRoom as useDeleteRoomMutation } from '~/utils/mutations/inventory/rooms'
import { equipmentByRoomQuery } from '~/utils/queries/inventory/equipment'

const props = defineProps<{
  room: DisplayRoom
}>()

// Check if the room has any storage equipment assigned to it

const {
  state: equipmentState,
  asyncStatus: equipmentStatus
} = useQueryColada(() => equipmentByRoomQuery(props.room.slug))

const equipmentInRoom = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : []
)

const hasEquipment = computed(() => equipmentInRoom.value.length > 0)
const isCheckingEquipment = computed(() => equipmentStatus.value === 'loading')
const isDeleteDisabled = computed(() => isCheckingEquipment.value || hasEquipment.value)

const deleteButtonLabel = computed(() => {
  if (isCheckingEquipment.value) {
    return 'Checking…'
  }
  if (hasEquipment.value) {
    return 'Contains stock'
  }
  return 'Delete room'
})

// Deletion logic

const { deleteRoom } = useDeleteRoomMutation()

const handleDelete = () => {
  if (isDeleteDisabled.value) {
    return
  }

  deleteRoom({
    slug: [props.room.slug],
    roomName: props.room.name
  })
}
</script>

<template>
  <NDialog
    title="Delete room"
    description="Are you sure you want to delete this room from Firn?"
  >
    <template #trigger>
      <NButton
        :label="deleteButtonLabel"
        size="sm"
        class="transition delay-300 ease-in-out"
        btn="soft-error hover:outline-error"
        :leading="isDeleteDisabled ? 'i-lucide-ban' : 'i-lucide-trash-2'"
        :disabled="isDeleteDisabled"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This action will permanently remove <span class="font-semibold text-error">{{ props.room.name }}</span> ({{ props.room.slug }}) from the inventory.
      </p>
      <p class="text-muted">
        The room can only be deleted when it contains no storage equipment.
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            class="transition delay-300 ease-in-out"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <NDialogClose>
          <NButton
            label="Delete room"
            class="transition delay-300 ease-in-out"
            btn="soft-error hover:outline-error"
            leading="i-lucide-trash-2"
            @click="handleDelete"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
