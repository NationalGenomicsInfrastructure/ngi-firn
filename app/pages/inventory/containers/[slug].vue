<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import {
  containerBySlugQuery,
  containerContentsQuery,
  containerDescendantsQuery
} from '~/utils/queries/inventory/containers'
import { CONTAINER_CLASSIFICATION_LABELS, CONTAINER_TYPE_LABELS } from '~/utils/inventory/containers'

definePageMeta({
  layout: 'private'
})

const route = useRoute()
const slug = computed(() => {
  const value = route.params.slug
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const { state: containerState, asyncStatus: containerStatus } = useQueryColada(
  () => containerBySlugQuery(slug.value)
)

const isLoading = computed(() => containerStatus.value === 'loading')
const isError = computed(() => containerState.value.status === 'error')

const errorMessage = computed(() => {
  if (containerState.value.status !== 'error') {
    return undefined
  }

  const message = containerState.value.error?.message
  return message != null && message.length > 0 ? message : 'Something went wrong while loading container details.'
})

const container = computed(() =>
  containerState.value.status === 'success' ? containerState.value.data : null
)

const currentContainerDocId = computed(() => container.value?._id ?? '')
const { state: contentsState } = useQueryColada(() => ({
  ...containerContentsQuery(currentContainerDocId.value),
  enabled: currentContainerDocId.value.length > 0
}))

const childContainers = computed(() =>
  contentsState.value.status === 'success' ? contentsState.value.data.containers : []
)

const childItems = computed(() =>
  contentsState.value.status === 'success' ? contentsState.value.data.items : []
)

const { state: descendantsState } = useQueryColada(() => ({
  ...containerDescendantsQuery(currentContainerDocId.value),
  enabled: currentContainerDocId.value.length > 0
}))

const descendants = computed(() =>
  descendantsState.value.status === 'success' ? descendantsState.value.data : []
)

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)

const containerTypeLabel = computed(() =>
  container.value ? CONTAINER_TYPE_LABELS[container.value.containerType] : '—'
)

const classificationLabel = computed(() =>
  container.value ? CONTAINER_CLASSIFICATION_LABELS[container.value.classification] : '—'
)

const gridLabel = computed(() => {
  if (!container.value || !container.value.rows || !container.value.columns) {
    return '—'
  }

  return `${container.value.rows} × ${container.value.columns}${container.value.levels ? ` × ${container.value.levels}` : ''}`
})

const infoFields = computed(() => {
  if (!container.value) {
    return []
  }

  return [
    { icon: 'i-lucide-key-round', label: 'Identifier', value: container.value.slug },
    { icon: 'i-lucide-box', label: 'Type', value: containerTypeLabel.value },
    { icon: 'i-lucide-tag', label: 'Classification', value: classificationLabel.value },
    {
      icon: 'i-lucide-grid-3x3',
      label: 'Grid',
      value: gridLabel.value
    },
    {
      icon: 'i-lucide-package-open',
      label: 'Capacity',
      value: container.value.capacity == null ? '—' : String(container.value.capacity)
    },
    { icon: 'i-lucide-align-left', label: 'Description', value: container.value.description ?? '—' }
  ]
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      :title="container ? container.name : 'Container details'"
      :description="containerTypeLabel"
    />

    <NAlert
      v-if="isLoading"
      alert="border-gray"
      title="Loading container..."
      description="Fetching container details."
      icon="i-lucide-loader-2"
      class="mt-6"
    />

    <NAlert
      v-else-if="isError"
      alert="border-error"
      title="Error loading container"
      :description="errorMessage"
      icon="i-lucide-alert-circle"
      class="mt-6"
    />

    <NAlert
      v-else-if="container == null"
      alert="border-warning"
      title="Container not found"
      description="No container exists for the provided identifier."
      icon="i-lucide-search-x"
      class="mt-6"
    />

    <div
      v-else
      class="mt-6 space-y-6"
    >
      <NCard
        card="outline-gray"
        :_card-content="{ class: 'space-y-4 py-4' }"
      >
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Container
            </p>
            <h3 class="text-lg font-semibold">
              {{ container.name }}
            </h3>
            <p class="text-sm text-muted">
              {{ container.label || '—' }}
            </p>
          </div>
          <NBadge
            :label="container.isActive ? 'Active' : 'Inactive'"
            :badge="container.isActive ? 'solid-success' : 'solid-gray'"
          />
        </header>

        <NSeparator />

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          <IndicatorIconCard
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
          />
        </div>

        <NSeparator />

        <footer class="flex flex-wrap items-center justify-end gap-2">
          <DialogInventoryContainerUpdate :container="container" />
          <DialogDeleteContainer
            v-if="isAdmin"
            :container="container"
            :parent-document-id="container.parent.id"
          />
        </footer>
      </NCard>

      <NCard
        title="Hierarchy"
        description="Location within the storage system"
        card="outline-gray"
      >
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-muted">Parent:</span>
            <span class="font-medium">{{ container.parent.id }}</span>
          </div>
          <div
            v-if="container.locationPath && container.locationPath.length > 0"
            class="flex items-center gap-2"
          >
            <span class="text-muted">Path:</span>
            <span class="font-medium">{{ container.locationPath.map(a => a.id).join(' > ') }}</span>
          </div>
        </div>
      </NCard>

      <InventoryContainerChildSection
        :container="container"
        :child-containers="childContainers"
      />

      <NCard
        title="Inventory items"
        description="Items stored in this container."
        card="outline-gray"
      >
        <div class="flex justify-end mb-4">
          <DialogInventoryItemAdd :parent-id="container._id" />
        </div>
        <div
          v-if="childItems.length === 0"
          class="text-sm text-muted"
        >
          No items yet. Use “Add item” to create one.
        </div>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b">
                <th class="text-left px-4 py-2">
                  Name
                </th>
                <th class="text-left px-4 py-2">
                  Category
                </th>
                <th class="text-left px-4 py-2">
                  Status
                </th>
                <th class="text-left px-4 py-2">
                  Quantity
                </th>
                <th class="text-left px-4 py-2">
                  Expiry
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in childItems"
                :key="item._id"
                class="border-b hover:bg-muted/30"
              >
                <td class="px-4 py-2 font-medium">
                  <NuxtLink
                    :to="`/inventory/items/${encodeURIComponent(item.slug)}`"
                    class="text-primary-400 dark:text-primary-600 hover:underline"
                  >
                    {{ item.name }}
                  </NuxtLink>
                </td>
                <td class="px-4 py-2">
                  {{ item.category }}
                </td>
                <td class="px-4 py-2">
                  <NBadge
                    :label="item.status"
                    :badge="item.status === 'available' ? 'solid-success' : 'solid-gray'"
                  />
                </td>
                <td class="px-4 py-2">
                  {{ item.quantity ?? '—' }} {{ item.unit ?? '' }}
                </td>
                <td class="px-4 py-2">
                  {{ item.expiryDate ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </NCard>

      <NCard
        v-if="container"
        title="All contents"
        description="Every container and item nested anywhere beneath this container."
        card="outline-gray"
      >
        <TableInventoryContents
          :entries="descendants"
          :root="{ id: container._id, name: container.name }"
        />
      </NCard>

      <div class="flex justify-end">
        <NButton
          label="Back to containers"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-arrow-left"
          to="/inventory/containers"
        />
      </div>
    </div>
  </main>
</template>
