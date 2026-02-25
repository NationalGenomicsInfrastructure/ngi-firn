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
    case 'Ongoing': return 'soft-primary'
    case 'Closed': return 'soft-gray'
    case 'Aborted': return 'solid-error'
    case 'Reception Control': return 'outline-primary'
    case 'Pending': return 'outline-gray'
    default: return 'soft-gray'
  }
})

const priorityVariant = computed(() => {
  switch (props.priority) {
    case 'High': return 'solid-error'
    case 'Standard': return 'soft-primary'
    case 'Low': return 'soft-gray'
    default: return 'soft-gray'
  }
})

const infoFields = computed(() => [
  { label: 'Open date', value: formatDate(props.openDate) },
  { label: 'Close date', value: formatDate(props.closeDate) },
  { label: 'Samples', value: props.noOfSamples != null ? String(props.noOfSamples) : '—' },
  { label: 'Application', value: props.application ?? '—' },
  { label: 'Affiliation', value: props.affiliation ?? '—' },
  { label: 'Contact', value: props.contact ?? '—' },
  { label: 'Delivery type', value: props.deliveryType ?? '—' },
  { label: 'Reference genome', value: props.referenceGenome ?? '—' }
])
</script>

<template>
  <NCard
    card="soft-gray"
    class="w-full"
  >
    <div class="flex flex-wrap items-center gap-3 mb-4">
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

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-sm">
      <div
        v-for="field in infoFields"
        :key="field.label"
      >
        <span class="font-semibold text-muted">{{ field.label }}</span>
        <p>{{ field.value }}</p>
      </div>
    </div>
  </NCard>
</template>
