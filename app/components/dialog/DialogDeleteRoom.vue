<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { Room } from '~~/types/inventory'
import { equipmentByRoomQuery } from '~/utils/queries/inventory/rooms'
import { deleteRoom as useDeleteRoomMutation } from '~/utils/mutations/inventory/rooms'

const props = defineProps<{
  room: Room
}>()

const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(
  () => equipmentByRoomQuery(props.room._id)
)

const equipmentInRoom = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : []
)

const equipmentCount = computed(() => equipmentInRoom.value.length)
const hasEquipment = computed(() => equipmentCount.value > 0)
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

const handleDelete = () => {
  if (isDeleteDisabled.value) {
    return
  }

  const { deleteRoom } = useDeleteRoomMutation()
  deleteRoom({
    id: props.room._id,
    rev: props.room._rev,
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
        This action will permanently remove <span class="font-semibold text-error">{{ props.room.name }}</span> ({{ props.room.roomId }}) from the inventory.
      </p>
      <p
        v-if="hasEquipment"
        class="text-muted"
      >
        This room still contains
        <span class="font-semibold text-error">{{ equipmentCount }}</span>
        {{ equipmentCount === 1 ? 'piece' : 'pieces' }}
        of storage equipment. Remove or move all equipment before deleting the room.
      </p>
      <p
        v-else
        class="text-muted"
      >
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
            :disabled="isDeleteDisabled"
            @click="handleDelete"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
