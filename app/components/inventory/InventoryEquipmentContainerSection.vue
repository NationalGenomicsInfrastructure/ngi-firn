<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayStorageEquipment } from '~~/types/inventory'
import { containersByEquipmentQuery } from '~/utils/queries/inventory/containers'

const props = defineProps<{
  equipment: DisplayStorageEquipment
}>()

const {
  state: containersState,
  asyncStatus: containersStatus
} = useQueryColada(() => containersByEquipmentQuery(props.equipment.slug))

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
        description="Fetching containers stored in this equipment."
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
        description="This equipment holds no containers yet."
        icon="i-lucide-package-open"
      />

      <TableContainerOverview
        v-else
        :containers="containers"
        :loading="isLoadingContainers"
        :show-parent="false"
      />
    </NTabsContent>

    <NTabsContent
      value="add"
      class="mt-4"
    >
      <StepperInventoryContainerAdd
        :parent-slug="equipment.slug"
        parent-kind="equipment"
      />
    </NTabsContent>
  </NTabs>
</template>
