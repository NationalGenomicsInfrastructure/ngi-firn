<script setup lang="ts">
defineProps<{
  parentId: string
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
    title="Add item"
    description="Create a new item in this location"
  >
    <template #trigger="{ open }">
      <NButton
        btn="soft-primary hover:outline-primary"
        leading="i-lucide-plus"
        label="Add item"
        @click="open"
      />
    </template>

    <div class="p-6">
      <FormInventoryItemAdd
        :parent-id="parentId"
        @close="handleClose"
        @success="handleSuccess"
      />
    </div>
  </NDialog>
</template>
