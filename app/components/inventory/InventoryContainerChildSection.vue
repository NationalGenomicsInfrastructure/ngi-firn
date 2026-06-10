<script setup lang="ts">
import type { Container } from '~~/types/inventory'

defineProps<{
  container: Container
  childContainers: Container[]
}>()
</script>

<template>
  <PageHeadline
    section="Child containers"
  />
  <NTabs default-value="list">
    <NTabsList class="mx-auto">
      <NTabsTrigger value="list">
        <NIcon name="i-lucide-list" />
        List containers
      </NTabsTrigger>
      <NTabsTrigger value="add">
        <NIcon name="i-lucide-plus" />
        Add container
      </NTabsTrigger>
    </NTabsList>

    <NTabsContent
      value="list"
      class="mt-4"
    >
      <NAlert
        v-if="childContainers.length === 0"
        alert="border-warning"
        title="No child containers"
        description="This container has no nested containers yet. Switch to the 'Add container' tab to create one."
        icon="i-lucide-box"
      />

      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <CardContainer
          v-for="childContainer in childContainers"
          :key="childContainer._id"
          :container="childContainer"
        />
      </div>
    </NTabsContent>

    <NTabsContent
      value="add"
      class="mt-4"
    >
      <StepperInventoryContainerAdd :parent-id="container._id" />
    </NTabsContent>
  </NTabs>
</template>
