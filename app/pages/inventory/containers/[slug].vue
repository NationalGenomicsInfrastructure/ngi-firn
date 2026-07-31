<script setup lang="ts">
import { useQuery as useQueryColada } from '@pinia/colada'
import { containerBySlugQuery } from '~/utils/queries/inventory/containers'
import { CONTAINER_TYPE_LABELS } from '~/utils/inventory/equipment'
import { getContainerStatusMeta, getClassificationBadge } from '~/utils/inventory/container'

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

const containerTypeLabel = computed(() =>
  container.value ? CONTAINER_TYPE_LABELS[container.value.containerType] : '—'
)

const statusMeta = computed(() =>
  container.value ? getContainerStatusMeta(container.value.status) : null
)

const parentRoute = computed(() => {
  const parent = container.value?.parentRef
  if (!parent) return null
  const base = parent.kind === 'equipment' ? '/inventory/equipment/' : '/inventory/containers/'
  return `${base}${encodeURIComponent(parent.slug)}`
})

const parentIcon = computed(() =>
  container.value?.parentRef?.kind === 'container' ? 'i-lucide-package' : 'i-lucide-refrigerator'
)

const infoFields = computed(() => {
  if (!container.value) {
    return []
  }

  return [
    { icon: 'i-lucide-key-round', label: 'Identifier', value: container.value.slug },
    { icon: 'i-lucide-package', label: 'Type', value: containerTypeLabel.value },
    { icon: 'i-lucide-tag', label: 'Classification', value: container.value.classification },
    { icon: 'i-lucide-activity', label: 'Status', value: statusMeta.value?.label ?? container.value.status },
    { icon: 'i-lucide-scan-barcode', label: 'Barcode', value: container.value.barcode ?? '—' },
    { icon: 'i-lucide-grid-3x3', label: 'Position', value: container.value.positionParent?.label ?? '—' },
    { icon: 'i-lucide-layout-template', label: 'Template', value: container.value.templateId ?? '—' },
    { icon: 'i-lucide-align-left', label: 'Description', value: container.value.description ?? '—' }
  ]
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8 lg:px-8 sm:px-6">
    <NButton
      btn="ghost-gray"
      leading="i-lucide-arrow-left"
      size="sm"
      label="Back to containers"
      to="/inventory/containers"
    />
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
          <div class="flex items-center gap-2">
            <NBadge
              :label="container.classification"
              :badge="getClassificationBadge(container.classification)"
            />
            <NBadge
              v-if="statusMeta"
              :label="statusMeta.label"
              :icon="statusMeta.icon"
              :badge="statusMeta.badge"
            />
          </div>
        </header>

        <NSeparator />

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          <IndicatorIconText
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
            :class="field.label === 'Description' ? 'sm:col-span-2' : undefined"
          />
        </div>

        <template v-if="container.activeFlags && container.activeFlags.length">
          <NSeparator />

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Active flags
            </span>
            <BadgesInventoryFlag
              v-for="flag in container.activeFlags"
              :key="flag"
              :flag="flag"
            />
          </div>
        </template>

        <NSeparator />

        <InventoryContainerCapacityIndicator :capacity="container.capacity" />

        <NSeparator />

        <footer class="flex flex-wrap items-center justify-end gap-2">
          <DrawerInventoryContainerEdit :container="container" />
        </footer>
      </NCard>

      <NCard
        v-if="container.parentRef"
        title="Container location"
        description="The parent that directly holds this container."
        card="outline-gray"
      >
        <IndicatorIconLarge
          :icon="parentIcon"
          label="Stored in"
          :value="`${container.parentRef.name} (${container.parentRef.slug})`"
        />

        <NSeparator />

        <div class="flex flex-wrap items-center justify-end gap-4">
          <NButton
            label="Open parent"
            btn="soft-primary hover:outline-primary"
            :leading="parentIcon"
            :to="parentRoute ?? undefined"
          />
        </div>
      </NCard>

      <NCard
        title="Action log"
        description="The most recent audit entries for this container."
        card="outline-gray"
      >
        <TableContainerActionLog
          :entries="container.recentActionLog"
          :slug="container.slug"
        />
      </NCard>

      <InventoryContainerChildrenSection :container="container" />

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
