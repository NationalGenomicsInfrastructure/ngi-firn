<script setup lang="ts">
import type { DisplayRoom } from '~~/types/inventory'
import { ROOM_EDIT_FORM_ID_PREFIX } from '~/utils/inventory/room'

const props = defineProps<{
  room: DisplayRoom
}>()

const isDialogOpen = ref(false)
const formId = computed(() => `${ROOM_EDIT_FORM_ID_PREFIX}${props.room.slug}`)

function onDialogOpenChange(open: boolean) {
  isDialogOpen.value = open
}
</script>

<template>
  <NDialog
    :open="isDialogOpen"
    title="Edit room"
    description="Update room information and status"
    scrollable
    @update:open="onDialogOpenChange"
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
      @saved="isDialogOpen = false"
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
          btn="soft-success hover:outline-success"
          trailing="i-lucide-check"
        />
      </div>
    </template>
  </NDialog>
</template>
