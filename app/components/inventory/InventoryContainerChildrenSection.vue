<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { DisplayContainer } from '~~/types/inventory'
import { containersByParentQuery } from '~/utils/queries/inventory/containers'

const props = defineProps<{
  container: DisplayContainer
}>()

const {
  state: childrenState,
  asyncStatus: childrenStatus
} = useQueryColada(() => containersByParentQuery(props.container.slug))

const children = computed(() =>
  childrenState.value.status === 'success' ? childrenState.value.data : []
)

const isLoadingChildren = computed(() => childrenStatus.value === 'loading')
const isChildrenError = computed(() => childrenState.value.status === 'error')

const childrenErrorMessage = computed(() => {
  if (childrenState.value.status !== 'error') {
    return undefined
  }

  const message = childrenState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading nested containers.'
})
</script>

<template>
  <PageHeadline
    section="Containers nested in this container"
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
        v-if="isLoadingChildren"
        alert="border-gray"
        title="Loading containers..."
        description="Fetching containers nested in this container."
        icon="i-lucide-loader-2"
      />

      <NAlert
        v-else-if="isChildrenError"
        alert="border-error"
        title="Error loading containers"
        :description="childrenErrorMessage"
        icon="i-lucide-alert-circle"
      />

      <NAlert
        v-else-if="children.length === 0"
        alert="border-warning"
        title="No nested containers"
        description="This container holds no nested containers yet."
        icon="i-lucide-package-open"
      />

      <TableContainerOverview
        v-else
        :containers="children"
        :loading="isLoadingChildren"
        :show-parent="false"
      />
    </NTabsContent>

    <NTabsContent
      value="add"
      class="mt-4"
    >
      <StepperInventoryContainerAdd
        :parent-slug="container.slug"
        parent-kind="container"
      />
    </NTabsContent>
  </NTabs>
</template>
