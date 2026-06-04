<script setup lang="ts">
import type { Room } from '~~/types/inventory'

const props = defineProps<{
  room: Room
}>()

const isDialogOpen = ref(false)
const formId = computed(() => `inventory-room-edit-${props.room._id}`)

function onDialogOpenChange(open: boolean) {
  isDialogOpen.value = open
}

function onSaved() {
  isDialogOpen.value = false
}
</script>

<template>
  <NDialog
    :model-value="isDialogOpen"
    title="Edit room"
    description="Update room information and status"
    scrollable
    @update:model-value="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        label="Edit room"
        size="sm"
        class="transition delay-300 ease-in-out"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-pencil"
      />
    </template>

    <FormInventoryRoomEdit
      :room="room"
      :form-id="formId"
      hide-submit
      @saved="onSaved"
    />

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
        <NButton
          type="submit"
          :form="formId"
          label="Save changes"
          class="transition delay-300 ease-in-out"
          btn="soft-primary hover:outline-primary"
          trailing="i-lucide-check"
        />
      </div>
    </template>
  </NDialog>
</template>
