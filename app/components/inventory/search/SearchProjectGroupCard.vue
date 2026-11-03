<script setup lang="ts">
import type { SearchEntityKind, SearchInventoryHit, SearchProjectGroup } from '~~/types/search'
import type { InventoryStatusType } from '~~/schemas/inventory/metadata'

const props = defineProps<{
  group: SearchProjectGroup
  /* The active inventory filters, so the group's "load more" stays consistent with the search. */
  kinds: SearchEntityKind[]
  statuses: InventoryStatusType[]
  roomSlug?: string
}>()

const project = computed(() => props.group.project)

/* Accumulate loaded inventory locally so each group paginates independently of the others. */
const items = ref<SearchInventoryHit[]>([...props.group.inventory.hits])
const offset = ref(props.group.inventory.hits.length)
const total = ref(props.group.inventory.total)
const hasMore = ref(props.group.inventory.hasMore)
const loadingMore = ref(false)

/* A new search replaces the group object: re-seed from its first page. */
watch(() => props.group, (next) => {
  items.value = [...next.inventory.hits]
  offset.value = next.inventory.hits.length
  total.value = next.inventory.total
  hasMore.value = next.inventory.hasMore
})

async function loadMore() {
  if (loadingMore.value || !hasMore.value) {
    return
  }
  loadingMore.value = true
  try {
    const { $trpc } = useNuxtApp()
    const page = await $trpc.inventory.search.projectGroupInventory.query({
      projectId: project.value.projectId,
      kinds: props.kinds,
      statuses: props.statuses,
      roomSlug: props.roomSlug,
      offset: offset.value,
      limit: props.group.inventory.limit
    })
    items.value.push(...page.hits)
    offset.value += page.hits.length
    total.value = page.total
    hasMore.value = page.hasMore
  }
  finally {
    loadingMore.value = false
  }
}
</script>

<template>
  <NCard card="soft-gray">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <NIcon
            name="i-lucide-folder-git-2"
            class="text-primary-500"
          />
          <NuxtLink
            :to="project.detailUrl"
            class="truncate text-base font-semibold hover:underline"
          >
            {{ project.projectName }}
          </NuxtLink>
          <NBadge
            badge="outline"
            :label="project.projectId"
            size="xs"
          />
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span v-if="project.application">{{ project.application }}</span>
          <span v-if="project.affiliation">· {{ project.affiliation }}</span>
          <span v-if="project.status">· {{ project.status }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NBadge
          badge="soft-primary"
          :label="`${project.linkedCount} linked`"
          size="xs"
        />
        <NButton
          :to="project.detailUrl"
          btn="ghost-gray"
          size="xs"
          trailing="i-lucide-external-link"
          label="Project"
        />
      </div>
    </div>

    <div
      v-if="items.length"
      class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2"
    >
      <InventorySearchHitCard
        v-for="hit in items"
        :key="hit.id"
        :hit="hit"
      />
    </div>
    <p
      v-else
      class="mt-4 text-sm text-muted"
    >
      No linked inventory matches the current filters.
    </p>

    <div
      v-if="hasMore"
      class="mt-4 flex justify-center"
    >
      <NButton
        btn="soft-gray"
        size="sm"
        :loading="loadingMore"
        label="Load more linked inventory"
        leading="i-lucide-chevron-down"
        @click="loadMore()"
      />
    </div>
  </NCard>
</template>
