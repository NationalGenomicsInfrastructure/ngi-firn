<script setup lang="ts">
import { getContainerStatusMeta } from '~/utils/inventory/container'
import { getSearchKindMeta, SEARCH_KIND_FILTER_ORDER } from '~/utils/inventory/search'
import { inventoryStatusSchema, type InventoryStatusType } from '~~/schemas/inventory/metadata'

definePageMeta({
  layout: 'private'
})

const {
  queryInput,
  kinds,
  statuses,
  hasQuery,
  isLoading,
  isError,
  error,
  results,
  freshness,
  projectGroups,
  directMatches,
  projectLookup,
  toggleKind,
  toggleStatus,
  loadMoreProjects,
  loadMoreInventory,
  reset
} = useInventorySearch()

const STATUS_FILTER_ORDER = inventoryStatusSchema.options as readonly InventoryStatusType[]

const hasProjectGroups = computed(() => (projectGroups.value?.groups.length ?? 0) > 0)
const hasDirectMatches = computed(() => (directMatches.value?.hits.length ?? 0) > 0)
const hasAnyResults = computed(() => hasProjectGroups.value || hasDirectMatches.value)
const showEmptyState = computed(() => hasQuery.value && !isLoading.value && !isError.value && results.value && !hasAnyResults.value)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 lg:px-8 sm:px-6">
    <PageTitle
      title="Search"
      description="Search the entire inventory and linked projects — rooms, equipment, containers, items and their project associations."
    />

    <NCard
      card="soft-primary"
      class="my-auto"
      :_card-content="{ class: 'p-3' }"
    >
      <NInput
        :model-value="queryInput"
        placeholder="Search by name, barcode, lot number, project, location…"
        leading="i-lucide-search"
        size="lg"
        aria-label="Search inventory and projects"
        :una="{ inputWrapper: 'w-full' }"
        @update:model-value="queryInput = ($event as string) ?? ''"
      >
        <template
          v-if="queryInput"
          #trailing
        >
          <NButton
            label="i-lucide-x"
            icon
            btn="ghost-gray"
            size="sm"
            aria-label="Clear search"
            @click="reset()"
          />
        </template>
      </NInput>

      <div class="mt-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Type</span>
          <NButton
            v-for="kind in SEARCH_KIND_FILTER_ORDER"
            :key="kind"
            size="xs"
            :btn="kinds.includes(kind) ? 'solid-primary' : 'soft-gray'"
            :leading="getSearchKindMeta(kind).icon"
            :label="getSearchKindMeta(kind).label"
            @click="toggleKind(kind)"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Status</span>
          <NButton
            v-for="status in STATUS_FILTER_ORDER"
            :key="status"
            size="xs"
            :btn="statuses.includes(status) ? 'solid-primary' : 'soft-gray'"
            :leading="getContainerStatusMeta(status).icon"
            :label="getContainerStatusMeta(status).label"
            @click="toggleStatus(status)"
          />
        </div>
      </div>
    </NCard>

    <NSeparator
      class="text-2xl mt-12 mb-6 col-span-1"
      label="Results"
    />

    <div class="mt-6">
      <InventorySearchStatusBanner :freshness="freshness" />

      <!-- Guidance before the first search -->
      <NAlert
        v-if="!hasQuery"
        alert="border-gray"
        title="Ready to search"
        description="Start typing to search across all inventory and linked projects"
        icon="i-lucide-search"
      />

      <NAlert
        v-else-if="isError"
        alert="border-error"
        title="Search failed"
        :description="`${error?.message ?? 'Search failed. Please try again.'}`"
        icon="i-lucide-alert-circle"
      />

      <!-- Loading (first page) -->
      <div
        v-else-if="isLoading && !results"
        class="flex items-center justify-center py-16 text-muted"
      >
        <NIcon
          name="i-lucide-loader-circle"
          class="animate-spin text-2xl"
        />
      </div>

      <!-- Empty -->
      <NAlert
        v-else-if="showEmptyState"
        alert="border-error"
        title="No results"
        :description="`No results for '${results?.query ?? ''}'. Try a different term or clear the filters`"
        icon="i-lucide-search-x"
      />

      <!-- Results -->
      <div
        v-else-if="hasAnyResults"
        class="space-y-10"
      >
        <!-- Projects whose metadata matched, each with their linked inventory -->
        <section v-if="hasProjectGroups">
          <div class="mb-3 flex items-center gap-2">
            <NIcon
              name="i-lucide-folder-git-2"
              class="text-primary-500"
            />
            <h2 class="text-lg font-semibold">
              Matching projects
            </h2>
            <NBadge
              badge="soft-gray"
              :label="String(projectGroups?.total ?? 0)"
              size="xs"
            />
          </div>
          <div class="space-y-4">
            <InventorySearchProjectGroupCard
              v-for="group in projectGroups?.groups"
              :key="group.project.projectId"
              :group="group"
              :kinds="kinds"
              :statuses="statuses"
            />
          </div>
          <div
            v-if="projectGroups?.hasMore"
            class="mt-4 flex justify-center"
          >
            <NButton
              btn="soft-gray"
              size="sm"
              :loading="isLoading"
              label="Load more projects"
              leading="i-lucide-chevron-down"
              @click="loadMoreProjects()"
            />
          </div>
        </section>

        <!-- Inventory whose own text matched, grouped by project -->
        <section v-if="hasDirectMatches">
          <div class="mb-3 flex items-center gap-2">
            <NIcon
              name="i-lucide-package-search"
              class="text-primary-500"
            />
            <h2 class="text-lg font-semibold">
              Matching inventory
            </h2>
            <NBadge
              badge="soft-gray"
              :label="`${directMatches?.total ?? 0}${directMatches?.totalIsEstimated ? '+' : ''}`"
              size="xs"
            />
          </div>
          <InventorySearchDirectMatches
            v-if="directMatches"
            :page="directMatches"
            :project-lookup="projectLookup"
          />
          <div
            v-if="directMatches?.hasMore"
            class="mt-4 flex justify-center"
          >
            <NButton
              btn="soft-gray"
              size="sm"
              :loading="isLoading"
              label="Load more inventory"
              leading="i-lucide-chevron-down"
              @click="loadMoreInventory()"
            />
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
