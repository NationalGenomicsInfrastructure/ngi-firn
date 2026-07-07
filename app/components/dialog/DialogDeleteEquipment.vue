<script setup lang="ts">
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { deleteEquipment as useDeleteEquipmentMutation } from '~/utils/mutations/inventory/equipment'

const props = defineProps<{
  equipment: DisplayStorageEquipment
  roomSlug: string
}>()

const { deleteEquipment } = useDeleteEquipmentMutation()

function handleDelete() {
  deleteEquipment({
    equipmentSlug: props.equipment.slug,
    equipmentName: props.equipment.name,
    roomSlug: props.roomSlug
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
        label="Delete"
        size="sm"
        btn="soft-error hover:outline-error"
        leading="i-lucide-trash-2"
      />
    </template>

    <div class="grid gap-4 p-4 ml-4">
      <p class="text-muted">
        This will permanently remove <span class="font-semibold text-error">{{ equipment.name }}</span> ({{ equipment.slug }}) from inventory.
      </p>
      <p class="text-muted">
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
            @click="handleDelete"
          />
        </NDialogClose>
      </div>
    </template>
  </NDialog>
</template>
