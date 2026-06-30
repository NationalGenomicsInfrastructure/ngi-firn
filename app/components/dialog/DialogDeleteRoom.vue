<script setup lang="ts">
import type { Room } from '~~/types/inventory'
import { deleteRoom as useDeleteRoomMutation } from '~/utils/mutations/inventory/rooms'

const props = defineProps<{
  room: Room
}>()

const { deleteRoom } = useDeleteRoomMutation()

const handleDelete = () => {
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
        label="Delete room"
        size="sm"
        class="transition delay-300 ease-in-out"
        btn="soft-error hover:outline-error"
        leading="i-lucide-trash-2"
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
