<script setup lang="ts">
import type { StorageEquipment } from '~~/types/inventory'

const props = defineProps<{
  equipment: StorageEquipment
  roomDocumentId: string
}>()

const isDialogOpen = ref(false)
const formId = computed(() => `inventory-equipment-edit-${props.equipment._id}`)

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
    title="Edit equipment"
    description="Update storage equipment details"
    scrollable
    @update:model-value="onDialogOpenChange"
  >
    <template #trigger>
      <NButton
        label="Edit"
        size="sm"
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-pencil"
      />
    </template>

    <FormInventoryEquipmentEdit
      :equipment="equipment"
      :room-document-id="roomDocumentId"
      :form-id="formId"
      hide-submit
      @saved="onSaved"
    />

    <template #footer>
      <div class="flex flex-col flex-col-reverse gap-4 sm:flex-row sm:justify-between shrink-0 w-full">
        <NDialogClose>
          <NButton
            label="Cancel"
            btn="soft-gray hover:outline-gray"
            leading="i-lucide-x"
          />
        </NDialogClose>
        <NButton
          type="submit"
          :form="formId"
          label="Save changes"
          btn="soft-success hover:outline-success"
          trailing="i-lucide-check"
        />
      </div>
    </template>
  </NDialog>
</template>
