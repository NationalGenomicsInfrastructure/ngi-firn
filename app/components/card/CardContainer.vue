<script setup lang="ts">
import type { Container } from '~~/types/inventory'
import { CONTAINER_CLASSIFICATION_LABELS, CONTAINER_TYPE_LABELS } from '~/utils/inventory/containers'

const props = withDefaults(defineProps<{
  container: Container
  linkToDetails?: boolean
}>(), {
  linkToDetails: true
})

const containerDetailPath = computed(() => `/inventory/containers/${encodeURIComponent(props.container.slug)}`)

const gridLabel = computed(() => {
  if (!props.container.rows || !props.container.columns) {
    return '—'
  }
  return `${props.container.rows} × ${props.container.columns}${props.container.levels ? ` × ${props.container.levels}` : ''}`
})

const typeLabel = computed(() => CONTAINER_TYPE_LABELS[props.container.containerType] ?? props.container.containerType)
const classificationLabel = computed(() => CONTAINER_CLASSIFICATION_LABELS[props.container.classification] ?? props.container.classification)

const infoFields = computed(() => [
  { icon: 'i-lucide-key-round', label: 'Identifier', value: props.container.slug },
  { icon: 'i-lucide-box', label: 'Type', value: typeLabel.value },
  { icon: 'i-lucide-tag', label: 'Classification', value: classificationLabel.value },
  { icon: 'i-lucide-grid-3x3', label: 'Grid', value: gridLabel.value },
  { icon: 'i-lucide-package-open', label: 'Capacity', value: props.container.capacity == null ? '—' : String(props.container.capacity) },
  { icon: 'i-lucide-align-left', label: 'Description', value: props.container.description ?? '—' }
])

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.isAdminClientside ?? false)
</script>

<template>
  <NCard
    card="outline-gray"
    class="h-full flex flex-col"
    :class="linkToDetails ? 'transition-colors hover:border-primary-400 dark:hover:border-primary-500' : undefined"
    :_card-content="{ class: 'flex flex-1 flex-col min-h-0' }"
  >
    <div class="flex flex-1 flex-col py-4 min-h-0">
      <NuxtLink
        v-if="linkToDetails"
        :to="containerDetailPath"
        class="flex flex-1 flex-col min-h-0 no-underline text-inherit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer hover:bg-muted/30 -mx-1 px-1 transition-colors"
      >
        <header class="shrink-0 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Container
            </p>
            <h3 class="text-lg font-semibold truncate">
              {{ container.name }}
            </h3>
            <p class="text-sm text-muted truncate">
              {{ container.label || '—' }}
            </p>
          </div>
          <div class="shrink-0 flex flex-col items-end justify-start">
            <NBadge
              :label="container.isActive ? 'Active' : 'Inactive'"
              :badge="container.isActive ? 'solid-success' : 'solid-gray'"
            />
          </div>
        </header>

        <NSeparator class="shrink-0 my-4" />

        <div class="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm content-start">
          <IndicatorIconCard
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
          />
        </div>
      </NuxtLink>

      <div
        v-else
        class="flex flex-1 flex-col min-h-0"
      >
        <header class="shrink-0 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">
              Container
            </p>
            <h3 class="text-lg font-semibold truncate">
              {{ container.name }}
            </h3>
            <p class="text-sm text-muted truncate">
              {{ container.label || '—' }}
            </p>
          </div>
          <div class="shrink-0 flex flex-col items-end justify-start">
            <NBadge
              :label="container.isActive ? 'Active' : 'Inactive'"
              :badge="container.isActive ? 'solid-success' : 'solid-gray'"
            />
          </div>
        </header>

        <NSeparator class="shrink-0 my-4" />

        <div class="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm content-start">
          <IndicatorIconCard
            v-for="field in infoFields"
            :key="field.label"
            :icon="field.icon"
            :label="field.label"
            :value="field.value"
          />
        </div>
      </div>

      <NSeparator class="shrink-0 my-4" />

      <footer class="shrink-0 flex flex-wrap items-center justify-center gap-2">
        <DialogInventoryContainerUpdate :container="container" />
        <DialogDeleteContainer
          v-if="isAdmin"
          :container="container"
        />
      </footer>
    </div>
  </NCard>
</template>
