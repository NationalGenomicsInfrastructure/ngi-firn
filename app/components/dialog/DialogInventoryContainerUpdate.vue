<script setup lang="ts">
import type { Container } from '~~/types/inventory'

defineProps<{
  container: Container
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
    :title="`Edit ${container.name}`"
    description="Update container properties"
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
      <FormInventoryContainerEdit
        :container="container"
        @close="handleClose"
        @success="handleSuccess"
      />
    </div>
  </NDialog>
</template>
