<script setup lang="ts">
import type { SearchInventoryHit, SearchInventoryPage } from '~~/types/search'

const props = defineProps<{
  page: SearchInventoryPage
  projectLookup: Record<string, { projectName: string, detailUrl: string }>
}>()

const UNLINKED_KEY = '__unlinked__'

interface DirectGroup {
  key: string
  projectId: string | null
  projectName: string | null
  detailUrl: string | null
  hits: SearchInventoryHit[]
}

/*
 * Group the current page of direct inventory matches by their (first) linked project, with a
 * trailing "not linked to a project" group. Grouping is derived entirely from the page's hits and
 * the resolved project-name lookup, so no extra request is needed to render the section.
 */
const groups = computed<DirectGroup[]>(() => {
  const map = new Map<string, DirectGroup>()
  for (const hit of props.page.hits) {
    const projectId = hit.projectIds[0] ?? null
    const key = projectId ?? UNLINKED_KEY
    let group = map.get(key)
    if (!group) {
      const info = projectId ? props.projectLookup[projectId] : undefined
      group = {
        key,
        projectId,
        projectName: info?.projectName ?? projectId,
        detailUrl: info?.detailUrl ?? null,
        hits: []
      }
      map.set(key, group)
    }
    group.hits.push(hit)
  }
  /* Named project groups first (stable by name), the unlinked bucket last. */
  return [...map.values()].sort((a, b) => {
    if (a.key === UNLINKED_KEY) return 1
    if (b.key === UNLINKED_KEY) return -1
    return (a.projectName ?? '').localeCompare(b.projectName ?? '')
  })
})
</script>

<template>
  <div class="space-y-5">
    <div
      v-for="group in groups"
      :key="group.key"
    >
      <div class="mb-2 flex items-center gap-2">
        <NIcon
          :name="group.projectId ? 'i-lucide-folder-git-2' : 'i-lucide-folder-x'"
          class="text-primary-500"
        />
        <NuxtLink
          v-if="group.detailUrl"
          :to="group.detailUrl"
          class="text-sm font-semibold hover:underline"
        >
          {{ group.projectName }}
        </NuxtLink>
        <span
          v-else
          class="text-sm font-semibold text-muted"
        >
          {{ group.projectName ?? 'Not linked to a project' }}
        </span>
      </div>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3 md:grid-cols-2">
        <InventorySearchHitCard
          v-for="hit in group.hits"
          :key="hit.id"
          :hit="hit"
        />
      </div>
    </div>
  </div>
</template>
