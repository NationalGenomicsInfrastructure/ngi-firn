<script setup lang="ts">
import type { ProjectSample } from '~~/types/projects'
import { getSampleTimelineEntries } from '~/utils/projects/timeline-entries'
import { formatDate } from '~/utils/dates/formatting'

const props = withDefaults(
  defineProps<{
    sample?: ProjectSample | null
    sampleId?: string
  }>(),
  { sampleId: undefined }
)

const timelineEntries = computed(() =>
  getSampleTimelineEntries(props.sample as Record<string, unknown> | undefined, props.sampleId)
)

const stepperItems = computed(() =>
  timelineEntries.value.map(entry => {
    const dateStr = entry.date.toISO()
    const formatted = formatDate(dateStr ?? undefined)
    return {
      title: entry.label,
      description: formatted,
      icon: 'i-lucide-calendar' as const
    }
  })
)

const hasEntries = computed(() => timelineEntries.value.length > 0)
</script>

<template>
  <div class="mt-4">
    <NCard
      v-if="!hasEntries"
      card="outline-gray"
      :title="sampleId ? `Timeline — ${sampleId}` : 'Sample timeline'"
      description="Chronological view of date-bearing events for this sample."
      :una="{ cardDescription: 'text-muted' }"
    >
      <p class="text-muted">
        No dates available for this sample.
      </p>
    </NCard>
    <NStepper
      v-else
      :items="stepperItems"
      orientation="horizontal"
      :disabled="true"
      stepper="solid-primary"
    />
  </div>
</template>
