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
  <!-- The whole card is the link, so there is exactly one interactive target per hit. -->
  <NuxtLink
    :to="hit.detailUrl"
    class="group flex h-full gap-3 rounded-xl border border-base bg-background p-4 text-inherit no-underline shadow-sm transition hover:border-primary-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:border-primary-500"
  >
    <div
      class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
      aria-hidden="true"
    >
      <NIcon
        :name="kindMeta.icon"
        class="text-xl m-1"
      />
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate text-xs font-semibold uppercase tracking-wider text-muted">
        {{ kindMeta.label }}<template v-if="subtypeLabel">
          · {{ subtypeLabel }}
        </template>
      </p>
      <h3 class="truncate text-base font-semibold group-hover:text-primary-700 dark:group-hover:text-primary-300">
        {{ hit.name }}
      </h3>
      <p
        v-if="hit.label"
        class="truncate text-sm text-muted"
      >
        {{ hit.label }}
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
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
        <NBadge
          v-if="hit.classification"
          badge="soft-primary"
          :label="hit.classification"
          size="xs"
        />
      </div>

      <dl class="mt-3 space-y-1 text-xs text-muted">
        <div class="flex items-center gap-1.5">
          <dt class="sr-only">
            Identifier
          </dt>
          <NIcon
            name="i-lucide-hash"
            class="shrink-0"
          />
          <dd class="truncate font-mono">
            {{ hit.slug }}
          </dd>
        </div>
        <div
          v-if="hit.barcode"
          class="flex items-center gap-1.5"
        >
          <dt class="sr-only">
            Barcode
          </dt>
          <NIcon
            name="i-lucide-scan-barcode"
            class="shrink-0"
          />
          <dd class="truncate font-mono">
            {{ hit.barcode }}
          </dd>
        </div>
        <div
          v-if="locationPath"
          class="flex items-start gap-1.5"
        >
          <dt class="sr-only">
            Location
          </dt>
          <NIcon
            name="i-lucide-map-pin"
            class="mt-0.5 shrink-0"
          />
          <dd class="truncate">
            {{ locationPath }}
          </dd>
        </div>
      </dl>

      <p
        v-if="hit.description"
        class="mt-2 line-clamp-2 text-xs text-muted"
      >
        {{ hit.description }}
      </p>
    </div>

    <NIcon
      name="i-lucide-arrow-up-right"
      class="shrink-0 text-lg text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      aria-hidden="true"
    />
  </NuxtLink>
</template>
