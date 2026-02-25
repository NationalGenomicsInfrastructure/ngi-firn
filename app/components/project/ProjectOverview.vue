<script setup lang="ts">
import type { ProjectStatusFields, ProjectPriority } from '~~/types/projects'
import { formatDate } from '~/utils/dates/formatting'

const props = defineProps<{
  projectName: string
  projectId: string
  statusFields?: ProjectStatusFields
  priority?: ProjectPriority
  openDate?: string
  closeDate?: string
  noOfSamples?: number
  application?: string | null
  affiliation?: string
  contact?: string | null
  deliveryType?: string
  referenceGenome?: string
}>()

const statusVariant = computed(() => {
  switch (props.statusFields?.status) {
    case 'Ongoing': return 'solid-primary'
    case 'Closed': return 'solid-gray'
    case 'Aborted': return 'solid-error'
    case 'Reception Control': return 'solid-yellow'
    case 'Pending': return 'solid-gray'
    default: return 'solid-gray'
  }
})

const priorityVariant = computed(() => {
  switch (props.priority) {
    case 'High': return 'solid-error'
    case 'Standard': return 'solid-primary'
    case 'Low': return 'solid-gray'
    default: return 'solid-gray'
  }
})

const activeFlags = computed(() => {
  if (!props.statusFields) return []
  const flagDefs: Array<{ key: keyof Omit<ProjectStatusFields, 'status'>, label: string, icon: string, variant: string }> = [
    { key: 'open', label: 'Open', icon: 'i-lucide-lock-open', variant: 'solid-primary' },
    { key: 'ongoing', label: 'Ongoing', icon: 'i-lucide-play', variant: 'solid-primary' },
    { key: 'closed', label: 'Closed', icon: 'i-lucide-lock', variant: 'solid-gray' },
    { key: 'pending', label: 'Pending', icon: 'i-lucide-clock', variant: 'solid-yellow' },
    { key: 'reception_control', label: 'Reception control', icon: 'i-lucide-package-check', variant: 'solid-indigo' },
    { key: 'aborted', label: 'Aborted', icon: 'i-lucide-ban', variant: 'solid-error' },
    { key: 'need_review', label: 'Needs review', icon: 'i-lucide-alert-triangle', variant: 'solid-yellow' }
  ]
  return flagDefs.filter(f => props.statusFields?.[f.key])
})

const infoFields = computed(() => [
  { icon: 'i-lucide-calendar', label: 'Open date', value: formatDate(props.openDate) },
  { icon: 'i-lucide-calendar-check', label: 'Close date', value: formatDate(props.closeDate) },
  { icon: 'i-lucide-test-tubes', label: 'Samples', value: props.noOfSamples != null ? String(props.noOfSamples) : '—' },
  { icon: 'i-lucide-microscope', label: 'Application', value: props.application ?? '—' },
  { icon: 'i-lucide-building-2', label: 'Affiliation', value: props.affiliation ?? '—' },
  { icon: 'i-lucide-user', label: 'Contact', value: props.contact ?? '—' },
  { icon: 'i-lucide-truck', label: 'Delivery type', value: props.deliveryType ?? '—' },
  { icon: 'i-lucide-dna', label: 'Reference genome', value: props.referenceGenome ?? '—' }
])
</script>

<template>
  <NCard
    card="outline-gray"
    class="w-full"
  >
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <h2 class="text-xl font-semibold tracking-tight">
        {{ projectName }}
      </h2>
      <NBadge
        badge="outline"
        :label="projectId"
      />
      <NBadge
        v-if="statusFields?.status"
        :badge="statusVariant"
        :label="statusFields.status"
      />
      <NBadge
        v-if="priority"
        :badge="priorityVariant"
        :label="`Priority: ${priority}`"
      />
    </div>

    <div
      v-if="activeFlags.length"
      class="flex flex-wrap gap-2 mb-4"
    >
      <NBadge
        v-for="flag in activeFlags"
        :key="flag.key"
        :badge="flag.variant"
        :icon="flag.icon"
        :label="flag.label"
      />
    </div>

    <NSeparator class="my-4" />

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
      <div
        v-for="field in infoFields"
        :key="field.label"
      >
        <div class="flex items-center gap-1.5 mb-0.5">
          <NIcon
            :name="field.icon"
            class="text-primary-400 dark:text-primary-600 text-xs"
          />
          <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">{{ field.label }}</span>
        </div>
        <p class="font-medium pl-5">
          {{ field.value }}
        </p>
      </div>
    </div>
  </NCard>
</template>
