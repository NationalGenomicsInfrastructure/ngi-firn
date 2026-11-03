<script setup lang="ts">
import type { SearchInventoryHit } from '~~/types/search'
import {
  getHitActiveMeta,
  getHitStatusMeta,
  getHitSubtypeLabel,
  getSearchKindMeta
} from '~/utils/inventory/search'

const props = defineProps<{
  hit: SearchInventoryHit
}>()

const kindMeta = computed(() => getSearchKindMeta(props.hit.kind))
const subtypeLabel = computed(() => getHitSubtypeLabel(props.hit))
const statusMeta = computed(() => getHitStatusMeta(props.hit))
const activeMeta = computed(() => getHitActiveMeta(props.hit))
const locationPath = computed(() => props.hit.locationPath.join(' › '))
</script>

<template>
  <NCard
    card="outline-gray"
    class="h-full"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <NBadge
            :badge="kindMeta.badge"
            :label="kindMeta.label"
            :leading="kindMeta.icon"
            size="xs"
          />
          <NBadge
            badge="outline"
            :label="hit.slug"
            size="xs"
          />
        </div>
        <NuxtLink
          :to="hit.detailUrl"
          class="mt-2 block truncate text-base font-semibold hover:underline"
        >
          {{ hit.name }}
        </NuxtLink>
        <p
          v-if="hit.label"
          class="truncate text-xs text-muted"
        >
          {{ hit.label }}
        </p>
      </div>
      <NButton
        :to="hit.detailUrl"
        btn="ghost-gray"
        size="xs"
        trailing="i-lucide-external-link"
        label="Open"
      />
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <NBadge
        v-if="subtypeLabel"
        badge="soft-gray"
        :label="subtypeLabel"
        size="xs"
      />
      <NBadge
        v-if="hit.classification"
        badge="soft-primary"
        :label="hit.classification"
        size="xs"
      />
      <NBadge
        v-if="statusMeta"
        :badge="statusMeta.badge"
        :label="statusMeta.label"
        :leading="statusMeta.icon"
        size="xs"
      />
      <NBadge
        v-else-if="activeMeta"
        :badge="activeMeta.badge"
        :label="activeMeta.label"
        :leading="activeMeta.icon"
        size="xs"
      />
    </div>

    <div
      v-if="hit.barcode"
      class="mt-2 flex items-center gap-1.5 text-xs text-muted"
    >
      <NIcon name="i-lucide-scan-barcode" />
      <span class="font-mono">{{ hit.barcode }}</span>
    </div>

    <div
      v-if="locationPath"
      class="mt-2 flex items-start gap-1.5 text-xs text-muted"
    >
      <NIcon
        name="i-lucide-map-pin"
        class="mt-0.5 shrink-0"
      />
      <span class="truncate">{{ locationPath }}</span>
    </div>

    <p
      v-if="hit.description"
      class="mt-2 line-clamp-2 text-xs text-muted"
    >
      {{ hit.description }}
    </p>
  </NCard>
</template>
