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

const hasActiveFilters = computed(() => kinds.value.length > 0 || statuses.value.length > 0)

function clearFilters() {
  kinds.value = []
  statuses.value = []
}

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

    <FilterBar label="Search filters">
      <template #primary>
        <NInput
          :model-value="queryInput"
          placeholder="Search by name, barcode, lot number, project, location…"
          leading="i-lucide-search"
          input="~"
          size="lg"
          aria-label="Search inventory and projects"
          class="flex-1 text-lg"
          :una="{ inputWrapper: 'w-full', input: 'h-14 bg-transparent text-lg ring-0 focus-visible:ring-0 shadow-none' }"
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
      </template>

      <div class="flex flex-wrap items-center gap-x-7 gap-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <FilterLabel class="mr-1">
            Type
          </FilterLabel>
          <NButton
            v-for="kind in SEARCH_KIND_FILTER_ORDER"
            :key="kind"
            size="xs"
            class="rounded-full"
            :btn="kinds.includes(kind) ? 'solid-primary' : 'outline-gray'"
            :leading="getSearchKindMeta(kind).icon"
            :label="getSearchKindMeta(kind).label"
            :aria-pressed="kinds.includes(kind)"
            @click="toggleKind(kind)"
          />
        </div>
        <div
          class="hidden h-5 w-px bg-border sm:block"
          aria-hidden="true"
        />
        <div class="flex flex-wrap items-center gap-2">
          <FilterLabel class="mr-1">
            Status
          </FilterLabel>
          <NButton
            v-for="status in STATUS_FILTER_ORDER"
            :key="status"
            size="xs"
            class="rounded-full"
            :btn="statuses.includes(status) ? 'solid-primary' : 'outline-gray'"
            :leading="getContainerStatusMeta(status).icon"
            :label="getContainerStatusMeta(status).label"
            :aria-pressed="statuses.includes(status)"
            @click="toggleStatus(status)"
          />
        </div>
        <!-- Always rendered (just hidden) so toggling a filter never changes the bar's height. -->
        <NButton
          class="ml-auto"
          :class="{ invisible: !hasActiveFilters }"
          :disabled="!hasActiveFilters"
          :aria-hidden="!hasActiveFilters"
          :tabindex="hasActiveFilters ? 0 : -1"
          btn="link-primary"
          size="xs"
          label="Clear filters"
          @click="clearFilters"
        />
      </div>
    </FilterBar>

    <SectionHeading
      title="Results"
      class="mt-12 mb-6"
    />

    <div>
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
          <SectionHeading
            title="Matching projects"
            variant="section"
            icon="i-lucide-folder-git-2"
            class="mb-4"
          >
            <template #badge>
              <NBadge
                badge="soft-gray"
                :label="String(projectGroups?.total ?? 0)"
                size="xs"
              />
            </template>
          </SectionHeading>
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
          <SectionHeading
            title="Matching inventory"
            variant="section"
            icon="i-lucide-package-search"
            class="mb-4"
          >
            <template #badge>
              <NBadge
                badge="soft-gray"
                :label="`${directMatches?.total ?? 0}${directMatches?.totalIsEstimated ? '+' : ''}`"
                size="xs"
              />
            </template>
          </SectionHeading>
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
