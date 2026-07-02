<script setup lang="ts">
import type { ProjectStatusFields, ProjectPriority } from '~~/types/projects'
import { formatDate } from '~/utils/dates/formatting'

const props = defineProps<{
  summaryTitle?: string
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
    <div class="flex justify-center my-3">
      <h2 class="text-center text-xl font-semibold tracking-tight">
        {{ summaryTitle ?? projectName }}
      </h2>
    </div>

    <BadgesProject
      :project-id="projectId"
      :status-fields="statusFields"
      :priority="priority"
    />

    <NSeparator class="my-4" />
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
      <IndicatorIconCard
        v-for="field in infoFields"
        :key="field.label"
        :icon="field.icon"
        :label="field.label"
        :value="field.value"
      />
    </div>
  </NCard>
</template>
