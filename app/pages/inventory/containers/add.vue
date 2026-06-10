<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { equipmentBySlugQuery, roomQuery } from '~/utils/queries/inventory/rooms'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const router = useRouter()

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

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <NCard
        title="Enter container details"
        card="outline-gray"
        class="lg:col-span-2"
        :una="{
          cardTitle: 'text-center scroll-m-20 font-semibold text-primary-700 dark:text-primary-400 text-lg lg:text-xl',
          cardContent: 'space-y-4',
          cardDescription: 'text-muted'
        }"
      >
        <FormInventoryContainerAdd
          v-if="effectiveParentId"
          :parent-id="effectiveParentId"
        />
        <NAlert
          v-else
          alert="border-warning"
          title="Parent container required"
          description="Please specify a parent container or equipment."
          icon="i-lucide-alert-circle"
        />
      </NCard>

      <NCard class="lg:col-span-1">
        <div class="space-y-3 text-sm">
          <div class="flex items-center gap-1.5 mt-4 mb-0.5">
            <NIcon
              name="i-lucide-info"
              class="text-primary-400 dark:text-primary-600 text-sm"
            />
            <span class="text-sm uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Before you add
            </span>
          </div>
          <p class="text-muted">
            Containers must have a parent (equipment or another container) and a unique name within that parent.
          </p>
          <p class="text-muted">
            Define the storage layout (rows, columns, levels) if this container will hold multiple items or nested containers.
          </p>
          <p class="text-muted">
            A color identifier helps distinguish containers visually in the lab.
          </p>
        </div>
      </NCard>
    </div>

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
