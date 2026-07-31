<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { ContainerParentKindType } from '~~/schemas/inventory/container'
import { equipmentBySlugQuery } from '~/utils/queries/inventory/equipment'
import { containerBySlugQuery } from '~/utils/queries/inventory/containers'

definePageMeta({
  layout: 'private'
})

const parentKind = ref<ContainerParentKindType>('equipment')
const selectedSlug = ref<string | null>(null)

function setParentKind(kind: ContainerParentKindType) {
  if (parentKind.value === kind) return
  parentKind.value = kind
  // Reset the selection so a stale slug from the other vocabulary is never used.
  selectedSlug.value = null
}

const hasSlug = computed(() => selectedSlug.value != null && selectedSlug.value.length > 0)

// Equipment parent branch
const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(
  () => ({
    ...equipmentBySlugQuery(selectedSlug.value ?? ''),
    enabled: parentKind.value === 'equipment' && hasSlug.value
  })
)

// Container parent branch
const { state: containerState, asyncStatus: containerStatus } = useQueryColada(
  () => ({
    ...containerBySlugQuery(selectedSlug.value ?? ''),
    enabled: parentKind.value === 'container' && hasSlug.value
  })
)

const isLoading = computed(() =>
  parentKind.value === 'equipment' ? equipmentStatus.value === 'loading' : containerStatus.value === 'loading'
)

const isError = computed(() =>
  parentKind.value === 'equipment' ? equipmentState.value.status === 'error' : containerState.value.status === 'error'
)

const errorMessage = computed(() => {
  const state = parentKind.value === 'equipment' ? equipmentState.value : containerState.value
  if (state.status !== 'error') {
    return undefined
  }
  const message = state.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading the parent.'
})

const equipment = computed(() =>
  parentKind.value === 'equipment' && equipmentState.value.status === 'success' ? equipmentState.value.data : null
)

const container = computed(() =>
  parentKind.value === 'container' && containerState.value.status === 'success' ? containerState.value.data : null
)

const parentNotFound = computed(() => hasSlug.value && !isLoading.value && !isError.value && !equipment.value && !container.value)
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <div class="mb-6 flex items-center gap-3">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Back to containers"
        to="/inventory/containers"
      />
    </div>
    <PageTitle
      title="Add container"
    />

    <NCard
      card="soft-gray"
      class="w-full my-auto"
      :_card-content="{ class: 'p-1' }"
    >
      <div class="p-4 flex flex-wrap items-center gap-3 m-auto">
        <h4 class="text-xs uppercase tracking-wide text-primary-700 dark:text-primary-300 font-medium">
          Add container to
        </h4>

        <div class="flex items-center gap-1">
          <NButton
            size="sm"
            leading="i-lucide-refrigerator"
            :btn="parentKind === 'equipment' ? 'solid-primary' : 'soft-gray hover:outline-gray'"
            label="Storage equipment"
            @click="setParentKind('equipment')"
          />
          <NButton
            size="sm"
            leading="i-lucide-package"
            :btn="parentKind === 'container' ? 'solid-primary' : 'soft-gray hover:outline-gray'"
            label="Another container"
            @click="setParentKind('container')"
          />
        </div>

        <SelectEquipment
          v-if="parentKind === 'equipment'"
          v-model="selectedSlug"
        />
        <SelectContainer
          v-else
          v-model="selectedSlug"
        />
      </div>
    </NCard>

    <NAlert
      v-if="hasSlug && isLoading"
      alert="border-gray"
      title="Loading parent..."
      description="Fetching parent details from the inventory database."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="hasSlug && isError"
      alert="border-error"
      title="Error loading parent"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="parentNotFound"
      alert="border-warning"
      title="Parent not found"
      description="No equipment or container exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-if="equipment || container"
      class="mt-6 space-y-6"
    >
      <InventoryEquipmentContainerSection
        v-if="equipment"
        :equipment="equipment"
      />
      <InventoryContainerChildrenSection
        v-else-if="container"
        :container="container"
      />

      <div class="flex justify-end mt-4">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to containers"
          to="/inventory/containers"
        />
      </div>
    </div>
  </main>
</template>
