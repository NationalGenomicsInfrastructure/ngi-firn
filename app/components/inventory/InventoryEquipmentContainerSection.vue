<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { StorageEquipment } from '~~/types/inventory'
import { containersByParentQuery } from '~/utils/queries/inventory/containers'

const props = defineProps<{
  equipment: StorageEquipment
}>()

const {
  state: containersState,
  asyncStatus: containersStatus
} = useQueryColada(() => containersByParentQuery(props.equipment._id))

const containers = computed(() =>
  containersState.value.status === 'success' ? containersState.value.data : []
)

const isLoadingContainers = computed(() => containersStatus.value === 'loading')
const isContainersError = computed(() => containersState.value.status === 'error')

const containersErrorMessage = computed(() => {
  if (containersState.value.status !== 'error') {
    return undefined
  }

  const message = containersState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading containers.'
})
</script>

<template>
  <PageHeadline
    section="Containers in this equipment"
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
        v-if="isLoadingContainers"
        alert="border-gray"
        title="Loading containers..."
        description="Fetching containers in this equipment."
        icon="i-lucide-loader-2"
      />

      <NAlert
        v-else-if="isContainersError"
        alert="border-error"
        title="Error loading containers"
        :description="containersErrorMessage"
        icon="i-lucide-alert-circle"
      />

      <NAlert
        v-else-if="containers.length === 0"
        alert="border-warning"
        title="No containers registered"
        description="This equipment has no containers yet. Switch to the 'Add container' tab to create one."
        icon="i-lucide-box"
      />

      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <CardContainer
          v-for="container in containers"
          :key="container._id"
          :container="container"
        />
      </div>
    </NTabsContent>

    <NTabsContent
      value="add"
      class="mt-4"
    >
      <StepperInventoryContainerAdd :parent-id="equipment._id" />
    </NTabsContent>
  </NTabs>
</template>
