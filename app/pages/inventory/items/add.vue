<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import type { ItemParentKind } from '~~/schemas/inventory/items'
import { containerBySlugQuery } from '~/utils/queries/inventory/containers'
import { equipmentBySlugQuery } from '~/utils/queries/inventory/equipment'

definePageMeta({ layout: 'private' })

const parentKind = ref<ItemParentKind>('equipment')
const selectedSlug = ref<string | null>(null)
const hasSlug = computed(() => selectedSlug.value != null && selectedSlug.value.length > 0)

function setParentKind(kind: ItemParentKind) {
  if (parentKind.value === kind) return
  parentKind.value = kind
  selectedSlug.value = null
}

const { state: equipmentState, asyncStatus: equipmentStatus } = useQueryColada(() => ({
  ...equipmentBySlugQuery(selectedSlug.value ?? ''),
  enabled: parentKind.value === 'equipment' && hasSlug.value
}))
const { state: containerState, asyncStatus: containerStatus } = useQueryColada(() => ({
  ...containerBySlugQuery(selectedSlug.value ?? ''),
  enabled: parentKind.value === 'container' && hasSlug.value
}))

const isLoading = computed(() => parentKind.value === 'equipment' ? equipmentStatus.value === 'loading' : containerStatus.value === 'loading')
const activeState = computed(() => parentKind.value === 'equipment' ? equipmentState.value : containerState.value)
const errorMessage = computed(() => activeState.value.status === 'error' ? activeState.value.error?.message ?? 'Something went wrong while loading the parent.' : undefined)
const equipment = computed(() => parentKind.value === 'equipment' && equipmentState.value.status === 'success' ? equipmentState.value.data : null)
const container = computed(() => parentKind.value === 'container' && containerState.value.status === 'success' ? containerState.value.data : null)
const parentNotFound = computed(() => hasSlug.value && !isLoading.value && !errorMessage.value && !equipment.value && !container.value)
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <div class="mb-6 flex items-center gap-3">
      <NButton
        btn="ghost-gray"
        leading="i-lucide-arrow-left"
        size="sm"
        label="Back to items"
        to="/inventory/items"
      />
    </div>
    <PageTitle title="Register item" />

    <NCard
      card="soft-gray"
      class="w-full my-auto"
      :_card-content="{ class: 'p-1' }"
    >
      <div class="p-4 flex flex-wrap items-center gap-3 m-auto">
        <h4 class="text-xs uppercase tracking-wide text-primary-700 dark:text-primary-300 font-medium">
          Register item in
        </h4>
        <div class="flex items-center gap-1">
          <NButton
            size="sm"
            leading="i-lucide-refrigerator"
            :btn="parentKind === 'equipment' ? 'soft-primary' : 'ghost-gray hover:outline-gray'"
            label="Storage equipment"
            @click="setParentKind('equipment')"
          />
          <NButton
            size="sm"
            leading="i-lucide-package"
            :btn="parentKind === 'container' ? 'soft-primary' : 'ghost-gray hover:outline-gray'"
            label="Container"
            @click="setParentKind('container')"
          />
        </div>
        <NSeparator
          orientation="vertical"
          icon
          class="mx-0 mr-2 h-4"
        />
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
      v-else-if="hasSlug && errorMessage"
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
      <InventoryEquipmentItemSection
        v-if="equipment"
        :equipment="equipment"
      />
      <InventoryContainerItemSection
        v-else-if="container"
        :container="container"
      />
      <div class="flex justify-end mt-4">
        <NButton
          btn="ghost-gray"
          leading="i-lucide-arrow-left"
          size="sm"
          label="Back to items"
          to="/inventory/items"
        />
      </div>
    </div>
  </main>
</template>
