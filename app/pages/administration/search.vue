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

    <NCard
      card="outline-gray"
      title="Overall search index health"
    >
      <NAlert
        v-if="status?.message"
        alert="border-gray"
        title="Search index status"
        description="`{{ status.message }}`"
        icon="i-lucide-info"
      />
      <div class="flex items-left justify-left gap-4 mb-4">
        <NBadge
          v-if="phaseMeta"
          size="2xl"
          :badge="phaseMeta.badge"
          :label="phaseMeta.label"
          :icon="phaseMeta.icon"
        />
      </div>

      <NSeparator
        class="text-2xl my-6 col-span-1 sm:col-span-2"
        label="Index details"
      />

      <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4 text-sm">
        <IndicatorIconText
          icon="i-lucide-boxes"
          label="Inventory index"
          :value="status ? yesNo(status.inventoryReady) : '—'"
        />

        <IndicatorIconText
          icon="i-lucide-folder-git-2"
          label="Project index"
          :value="status ? (status.projectsConfigured ? yesNo(status.projectsReady) : 'Not configured') : '—'"
        />

        <IndicatorIconText
          icon="i-lucide-refresh-cw"
          label="Last synced"
          :value="status?.lastSyncedAt ? formatDate(status.lastSyncedAt, { relative: true, time: true }) : '—'"
        />

        <IndicatorIconText
          icon="i-lucide-hammer"
          label="Last full rebuild"
          :value="status?.lastRebuiltAt ? formatDate(status.lastRebuiltAt, { relative: true, time: true }) : '—'"
        />
      </div>

      <div class="flex flex-wrap gap-3 justify-end my-8">
        <NTooltip
          tooltip="primary"
          content="A rebuild runs in the background and reconciles project groupings and deletions. The index
        stays searchable (as stale) while it runs."
        >
          <NButton
            btn="soft-primary hover:outline-primary"
            leading="i-lucide-hammer"
            label="Rebuild index now"
            :loading="isRebuilding"
            :disabled="isRebuilding || status?.phase === 'unavailable'"
            @click="onRebuild"
          />
        </NTooltip>
        <NButton
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-refresh-cw"
          label="Refresh status"
          :loading="isStatusLoading"
          @click="refetch()"
        />
      </div>
    </NCard>
  </div>
</template>
