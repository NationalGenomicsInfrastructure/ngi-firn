<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { equipmentBySlugQuery, roomQuery } from '~/utils/queries/inventory/rooms'

definePageMeta({
  layout: 'private'
})

const route = useRoute()

// Expect query param for parent ID, or fall back to rooms list
const parentSlug = computed(() => {
  const value = route.query.parent
  return typeof value === 'string' ? value : undefined
})

const parentId = computed(() => {
  const value = route.query.parentId
  return typeof value === 'string' ? value : undefined
})

// If we have a parentSlug, fetch the parent equipment
const { state: equipmentState } = useQueryColada(() => {
  if (!parentSlug.value) {
    return { key: ['disabled'], query: () => Promise.resolve(null) }
  }
  return equipmentBySlugQuery(parentSlug.value)
})

const parentEquipment = computed(() =>
  equipmentState.value.status === 'success' ? equipmentState.value.data : null
)

const parentRoomDocumentId = computed(() => parentEquipment.value?.parent?.id ?? '')
const { state: parentRoomState } = useQueryColada(() => ({
  ...roomQuery(parentRoomDocumentId.value),
  enabled: parentRoomDocumentId.value.length > 0
}))
const parentRoom = computed(() =>
  parentRoomState.value.status === 'success' ? parentRoomState.value.data : null
)

const backRoute = computed(() => {
  if (parentEquipment.value) {
    return `/inventory/equipment/${encodeURIComponent(parentEquipment.value.slug)}`
  }
  return '/inventory/containers'
})

const effectiveParentId = computed(() => parentId.value || parentEquipment.value?._id || '')

const pageTitle = computed(() => {
  if (parentEquipment.value && parentRoom.value) {
    return `Add container to ${parentEquipment.value.name}`
  }
  return 'Add container'
})

const pageDescription = computed(() => {
  if (parentEquipment.value && parentRoom.value) {
    return `Create a new container in ${parentRoom.value.name} → ${parentEquipment.value.name}`
  }
  return 'Register a new container in the inventory.'
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-6 flex items-center gap-3">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Back"
        :to="backRoute"
      />
    </div>
    <PageTitle
      :title="pageTitle"
      :description="pageDescription"
    />

    <div
      v-if="effectiveParentId"
      class="mt-4"
    >
      <StepperInventoryContainerAdd :parent-id="effectiveParentId" />
    </div>
    <NAlert
      v-else
      alert="border-warning"
      title="Parent required"
      description="Please specify a parent container or equipment via the URL query parameter."
      icon="i-lucide-alert-circle"
      class="mt-4"
    />

    <div class="flex justify-end mt-4">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Back"
        :to="backRoute"
      />
    </div>
  </div>
</template>
