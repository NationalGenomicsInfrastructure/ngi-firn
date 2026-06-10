<script setup lang="ts">
import type { InventoryItem } from '~~/types/inventory'

const props = defineProps<{
  item: InventoryItem
}>()

const isOpen = ref(false)

const handleSuccess = () => {
  isOpen.value = false
}

const handleClose = () => {
  isOpen.value = false
}
</script>

<template>
  <NDialog
    v-model="isOpen"
    :title="`Edit ${item.name}`"
    description="Update item properties"
  >
    <template #trigger="{ open }">
      <NButton
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-pencil"
        label="Edit"
        @click="open"
      />
    </template>

    <div class="p-6">
      <FormInventoryItemEdit
        :item="item"
        @close="handleClose"
        @success="handleSuccess"
      />
    </div>
  </NDialog>
</template>
