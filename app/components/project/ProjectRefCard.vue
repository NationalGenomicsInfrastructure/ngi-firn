<script setup lang="ts">
import type { InventoryProjectRef } from '~~/types/inventory'

const props = defineProps<{
  project: InventoryProjectRef
  unlinking?: boolean
}>()

const emit = defineEmits<{
  unlink: []
}>()

/* Unlinking needs a second tap, same pattern as the Clear button in ScanBasket. */
const confirmingUnlink = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

function onUnlink() {
  if (!confirmingUnlink.value) {
    confirmingUnlink.value = true
    confirmTimer = setTimeout(() => {
      confirmingUnlink.value = false
    }, 3000)
  }
  else {
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmingUnlink.value = false
    emit('unlink')
  }
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})

// Project names look like "A.Doe_23_01": the first two fragments identify the PI, the last two the year/sequence.
const fragments = computed(() => props.project.projectName?.split(/[_.]/g) ?? [])
const title = computed(() => [fragments.value[0], fragments.value[1]].filter(Boolean).join('. ') || props.project.projectName)
const isActive = computed(() => !['closed', 'aborted'].includes(props.project.status?.toLowerCase() ?? ''))
const avatar = computed(() => isActive.value ? 'outline-primary' : 'outline-gray')
</script>

<template>
  <div
    class="rounded-md bg-muted/30 p-4 border-l-8"
    :class="isActive ? 'border-primary-700 dark:border-primary-900' : 'border-gray-400 dark:border-gray-700'"
  >
    <div class="flex flex-wrap items-center gap-x-6 gap-y-4">
      <NAvatarGroup :max="2">
        <NAvatar
          :avatar="avatar"
          :label="fragments[2] ?? '—'"
          size="lg"
        />
        <NAvatar
          :avatar="avatar"
          :label="fragments[3] ?? '—'"
          size="xl"
        />
      </NAvatarGroup>

      <div class="min-w-0 flex-1 space-y-3">
        <h3 class="text-lg font-semibold tracking-tight">
          {{ title }}
          <span class="text-sm font-normal text-muted">({{ project.projectId }})</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
          <IndicatorIconText
            icon="i-lucide-flask-conical"
            label="Application"
            :value="project.application ?? '—'"
          />
          <IndicatorIconText
            icon="i-lucide-building-2"
            label="Affiliation"
            :value="project.affiliation ?? '—'"
          />
          <IndicatorIconText
            icon="i-lucide-signal"
            label="Status"
            :value="project.status ?? '—'"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <NButton
          size="sm"
          btn="soft-primary hover:outline-primary"
          leading="i-lucide-eye"
          label="View project"
          :to="`/projects/details/${project.projectId}`"
        />
        <NButton
          size="sm"
          :btn="confirmingUnlink ? 'solid-error' : 'soft-error hover:outline-error'"
          :leading="confirmingUnlink ? 'i-lucide-triangle-alert' : 'i-lucide-unlink'"
          :label="confirmingUnlink ? 'Tap again' : 'Unlink'"
          :loading="unlinking"
          @click="onUnlink"
        />
      </div>
    </div>
  </div>
</template>
