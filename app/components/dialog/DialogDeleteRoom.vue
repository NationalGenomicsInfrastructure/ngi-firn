<script setup lang="ts">
import type { Room } from '~~/types/inventory'
import { deleteRoom as useDeleteRoomMutation } from '~/utils/mutations/inventory/rooms'

const { user } = useUserSession()

const props = defineProps<{
  room: Room
}>()

const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

const handleDelete = () => {
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
    v-if="isAdmin"
    title="Delete room"
    description="Are you sure you want to delete this room from Firn?"
  >
    <template #trigger>
      <NButton
        label="Delete room"
        size="sm"
        class="transition delay-300 ease-in-out"
        btn="soft-error hover:outline-error"
        leading="i-lucide-trash-2"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This action will permanently remove <span class="font-semibold text-error">{{ props.room.name }}</span> ({{ props.room.roomId }}) from the inventory.
      </p>
      <p class="text-muted">
        The room can only be deleted when it contains no storage equipment. Remove or move all equipment in this room first.
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
