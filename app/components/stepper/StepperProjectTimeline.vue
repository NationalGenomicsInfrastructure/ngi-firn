<script setup lang="ts">
import type { Project } from '~~/types/projects'
import type { TimelineDate } from '~/utils/projects/timeline-entries'
import { getProjectTimelineEntries, getTimelineEntryIcon } from '~/utils/projects/timeline-entries'
import { formatDate, type DateFormatOptions } from '~/utils/dates/formatting'

const props = defineProps<{
  project?: Project | null
}>()

const relativeDates = ref(false)
const includeWeekday = ref(false)
const formatOptions = computed<DateFormatOptions>(() => ({
  relative: relativeDates.value,
  includeWeekday: includeWeekday.value,
  time: false
}))

watch(relativeDates, (isRelative) => {
  if (!isRelative) return
  if (includeWeekday.value) includeWeekday.value = false
})

watch(includeWeekday, (isRelative) => {
  if (!isRelative) return
  if (relativeDates.value) relativeDates.value = false
})

const timelineDates = computed(() => getProjectTimelineEntries(props.project))

interface StepperItemWithStepData {
  title: string
  description: string
  stepData: TimelineDate
}

const stepperItems = computed((): StepperItemWithStepData[] =>
  timelineDates.value.map(td => {
    const dateStr = td.date.toISO()
    const formatted = formatDate(dateStr ?? undefined, formatOptions.value)
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
  <div class="mt-6 mx-auto max-w-2xl px-1">
    <NCard
      card="outline-gray"
      title="Timeline"
      description="Chronological view of all date-bearing project events."
      :una="{ cardDescription: 'text-muted' }"
    >
      <div class="flex flex-col gap-6 sm:gap-8">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 justify-items-center sm:justify-items-stretch">
          <NFormGroup
            :label="relativeDates ? 'Dates: relative' : 'Dates: absolute'"
            class="w-full sm:max-w-xs"
            :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
          >
            <NSwitch v-model="relativeDates" />
          </NFormGroup>
          <NFormGroup
            :label="includeWeekday ? 'Weekdays: show' : 'Weekdays: hide'"
            class="w-full sm:max-w-xs"
            :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
          >
            <NSwitch v-model="includeWeekday" />
          </NFormGroup>
        </div>

        <NSeparator class="my-0" />

        <NAlert
          v-if="!hasEntries"
          alert="border-gray"
          title="No dates available"
          description="No dates available for this project."
          icon="i-lucide-calendar-off"
          class="text-center py-8"
        />
        <NStepper
          v-else
          :items="stepperItems"
          orientation="vertical"
          :disabled="true"
          stepper="solid-primary"
          class="w-full ml-4 mr-4"
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
    </NCard>
  </div>
</template>
