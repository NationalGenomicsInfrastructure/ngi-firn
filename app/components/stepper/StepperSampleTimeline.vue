<script setup lang="ts">
import type { ProjectSample } from '~~/types/projects'
import type { TimelineDate } from '~/utils/projects/timeline-entries'
import { getSampleTimelineEntries, getTimelineEntryIcon } from '~/utils/projects/timeline-entries'
import { formatDate } from '~/utils/dates/formatting'

const props = withDefaults(
  defineProps<{
    sample?: ProjectSample | null
    sampleId?: string
  }>(),
  { sampleId: undefined }
)

const timelineDates = computed(() =>
  getSampleTimelineEntries(props.sample as Record<string, unknown> | undefined, props.sampleId)
)

interface StepperItemWithStepData {
  title: string
  description: string
  stepData: TimelineDate
}

const stepperItems = computed((): StepperItemWithStepData[] =>
  timelineDates.value.map(td => {
    const dateStr = td.date.toISO()
    const formatted = formatDate(dateStr ?? undefined)
    return {
      title: formatted,
      description: '\u00A0',
      stepData: td
    }
  })
)

const hasEntries = computed(() => timelineDates.value.length > 0)
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
      orientation="vertical"
      :disabled="true"
      stepper="solid-primary"
      class="w-full"
    >
      <template #item="{ item, step }">
        <div class="flex text-start gap-2.5 w-full">
          <div
            class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-primary-100 dark:text-primary-900 bg-primary-700 dark:bg-primary-600"
            aria-hidden="true"
          >
            {{ (step as number) + 1 }}
          </div>
          <div class="flex-1 min-w-0 pb-6">
            <p class="text-md font-semibold mb-2">
              {{ item.title }}
            </p>
            <ul class="list-none pl-0 space-y-2">
              <li
                v-for="(entry, idx) in (item as StepperItemWithStepData).stepData.entries"
                :key="idx"
                class="flex items-center gap-2 text-sm"
              >
                <NIcon
                  :name="getTimelineEntryIcon(entry.source)"
                  class="text-primary-400 dark:text-primary-600 shrink-0"
                />
                <span class="font-medium">{{ entry.label }}</span>
                <span v-if="entry.context" class="text-muted">({{ entry.context }})</span>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </NStepper>
  </div>
</template>
