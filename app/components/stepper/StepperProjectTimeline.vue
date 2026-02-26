<script setup lang="ts">
import type { Project } from '~~/types/projects'
import { getProjectTimelineEntries } from '~/utils/projects/timeline-entries'
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

const timelineEntries = computed(() => getProjectTimelineEntries(props.project))

const stepperItems = computed(() =>
  timelineEntries.value.map(entry => {
    const dateStr = entry.date.toISO()
    const formatted = formatDate(dateStr ?? undefined, formatOptions.value)
    return {
      title: entry.label,
      description: entry.context ? `${formatted} (${entry.context})` : formatted,
      icon: 'i-lucide-calendar' as const
    }
  })
)

const hasEntries = computed(() => timelineEntries.value.length > 0)
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

        <NCard
          v-if="!hasEntries"
          card="soft-gray"
          class="text-center py-8"
        >
          <p class="text-muted">
            No dates available for this project.
          </p>
        </NCard>
        <NStepper
          v-else
          :items="stepperItems"
          orientation="vertical"
          :disabled="true"
          stepper="solid-primary"
          class="w-full ml-4 mr-4"
        />
      </div>
    </NCard>
  </div>
</template>
