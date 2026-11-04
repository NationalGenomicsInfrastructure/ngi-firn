<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { searchStatusQuery } from '~/utils/queries/inventory/search'
import { rebuildSearchIndex } from '~/utils/mutations/inventory/search'
import { formatDate } from '~/utils/dates/formatting'

definePageMeta({
  layout: 'private'
})

const { state: statusState, asyncStatus, refetch } = useQuery(searchStatusQuery)
const status = computed(() => statusState.value.status === 'success' ? statusState.value.data : undefined)
const isStatusLoading = computed(() => asyncStatus.value === 'loading')

const { rebuildSearchIndex: triggerRebuild, isLoading: isRebuilding } = rebuildSearchIndex()

/* Dynamic badge/icon values below are bound from this map; their colours/icons are safelisted in uno.config.ts. */
const PHASE_META = {
  ready: { label: 'Ready', badge: 'solid-success', icon: 'i-lucide-check-circle' },
  stale: { label: 'Stale', badge: 'solid-yellow', icon: 'i-lucide-clock-alert' },
  initializing: { label: 'Initializing', badge: 'solid-gray', icon: 'i-lucide-loader' },
  unavailable: { label: 'Unavailable', badge: 'solid-error', icon: 'i-lucide-cloud-off' }
} as const

const phaseMeta = computed(() => status.value ? PHASE_META[status.value.phase] : null)

const LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'

function yesNo(value: boolean | undefined): string {
  return value ? 'Yes' : 'No'
}

/*
 * The rebuild runs detached on the server, so after triggering it we briefly poll the status query
 * until `lastRebuiltAt` advances (or a timeout) to give the admin live feedback without a reload.
 */
let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
onBeforeUnmount(stopPolling)

async function onRebuild() {
  const before = status.value?.lastRebuiltAt ?? null
  await triggerRebuild()
  stopPolling()
  let ticks = 0
  pollTimer = setInterval(() => {
    ticks += 1
    void refetch()
    if ((status.value?.lastRebuiltAt ?? null) !== before || ticks > 40) {
      stopPolling()
    }
  }, 3000)
}
</script>

<template>
  <div>
    <PageTitle
      title="Search maintenance"
      description="Inspect the global search index and trigger a full rebuild."
    />

    <NCard card="outline-gray">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2">
          <NIcon
            name="i-lucide-search"
            class="text-muted"
          />
          <h4 class="text-sm font-semibold">
            Index status
          </h4>
        </div>
        <NBadge
          v-if="phaseMeta"
          :badge="phaseMeta.badge"
          :label="phaseMeta.label"
          :icon="phaseMeta.icon"
        />
      </div>

      <p
        v-if="status?.message"
        class="text-sm text-muted mb-4"
      >
        {{ status.message }}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-boxes"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span :class="LABEL_STYLE">Inventory index</span>
          </div>
          <p class="font-medium pl-5">
            {{ status ? yesNo(status.inventoryReady) : '—' }}
          </p>
        </div>

        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-folder-git-2"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span :class="LABEL_STYLE">Project index</span>
          </div>
          <p class="font-medium pl-5">
            {{ status ? (status.projectsConfigured ? yesNo(status.projectsReady) : 'Not configured') : '—' }}
          </p>
        </div>

        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-refresh-cw"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span :class="LABEL_STYLE">Last synced</span>
          </div>
          <p class="font-medium pl-5">
            {{ status?.lastSyncedAt ? formatDate(status.lastSyncedAt, { relative: true, time: true }) : '—' }}
          </p>
        </div>

        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <NIcon
              name="i-lucide-hammer"
              class="text-primary-400 dark:text-primary-600 text-xs"
            />
            <span :class="LABEL_STYLE">Last full rebuild</span>
          </div>
          <p class="font-medium pl-5">
            {{ status?.lastRebuiltAt ? formatDate(status.lastRebuiltAt, { relative: true, time: true }) : '—' }}
          </p>
        </div>
      </div>

      <NSeparator class="my-4" />

      <div class="flex flex-wrap items-center gap-3">
        <NButton
          leading="i-lucide-hammer"
          label="Rebuild index now"
          :loading="isRebuilding"
          :disabled="isRebuilding || status?.phase === 'unavailable'"
          @click="onRebuild"
        />
        <NButton
          btn="soft-gray"
          leading="i-lucide-refresh-cw"
          label="Refresh status"
          :loading="isStatusLoading"
          @click="refetch()"
        />
      </div>

      <p class="text-xs text-muted mt-3">
        A rebuild runs in the background and reconciles project groupings and deletions. The index
        stays searchable (as stale) while it runs.
      </p>
    </NCard>
  </div>
</template>
