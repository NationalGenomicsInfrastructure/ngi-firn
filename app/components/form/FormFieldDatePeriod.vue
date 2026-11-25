<script setup lang="ts">
import { DateTime } from 'luxon'

/*
 * Calendar date (yyyy-MM-dd) picked either directly, via quick picks or via a "days from today"
 * slider. v-model is the date; the number of days is emitted additionally as `update:period` for
 * forms that store it too. A date outside [minDays, maxDays] falls back to `defaultDays`.
 */
const FORM_LABEL_STYLE = 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium'
const DATE_FORMAT = 'yyyy-MM-dd'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  name?: string
  minDays?: number
  maxDays?: number
  defaultDays?: number
  /* Allow having no date at all (shows a clear button and a "no date" summary). */
  clearable?: boolean
  emptyText?: string
}>(), {
  modelValue: undefined,
  name: undefined,
  minDays: 1,
  maxDays: 365,
  defaultDays: 7,
  clearable: false,
  emptyText: 'No date set'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
  'update:period': [days: number]
}>()

const QUICK_PICKS = [
  { label: 'Today', days: 0 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 }
]

const quickPicks = computed(() =>
  QUICK_PICKS.filter(pick => pick.days >= props.minDays && pick.days <= props.maxDays)
)

const parsed = computed(() => {
  if (!props.modelValue) return undefined
  const date = DateTime.fromFormat(props.modelValue, DATE_FORMAT)
  return date.isValid ? date : undefined
})

// Calendar days from today, so "today + 7" is 7 regardless of the time of day.
const days = computed(() => {
  if (!parsed.value) return undefined
  return Math.round(parsed.value.startOf('day').diff(DateTime.now().startOf('day'), 'days').days)
})

const sliderValue = computed(() => [days.value ?? props.minDays])

const headline = computed(() => {
  if (days.value === undefined) return props.emptyText
  if (days.value === 0) return 'Today'
  if (days.value === 1) return 'Tomorrow'
  if (days.value < 0) return `${-days.value} days ago`
  return `In ${days.value} days`
})
const subline = computed(() => parsed.value?.toFormat('cccc, d LLLL yyyy') ?? '')

function setDays(count: number) {
  emit('update:modelValue', DateTime.now().plus({ days: count }).toFormat(DATE_FORMAT))
  emit('update:period', count)
}

function onDateUpdate(value: unknown) {
  if (typeof value !== 'string' || !value) {
    if (props.clearable) emit('update:modelValue', undefined)
    return
  }
  const date = DateTime.fromFormat(value, DATE_FORMAT)
  if (!date.isValid) return
  const count = Math.round(date.startOf('day').diff(DateTime.now().startOf('day'), 'days').days)
  if (count < props.minDays || count > props.maxDays) {
    setDays(props.defaultDays)
    return
  }
  emit('update:modelValue', value)
  emit('update:period', count)
}

function onPeriodUpdate(value: number[] | undefined) {
  if (value?.[0] !== undefined) setDays(value[0])
}
</script>

<template>
  <div class="space-y-4">
    <div
      class="flex items-center gap-3 rounded-md border p-3 transition-colors"
      :class="parsed ? 'border-primary bg-primary/10' : 'border-muted'"
    >
      <NIcon
        :name="parsed ? 'i-lucide-calendar-check' : 'i-lucide-calendar-off'"
        class="h-6 w-6 shrink-0"
        :class="parsed ? 'text-primary' : 'text-muted'"
      />
      <div class="min-w-0 flex-1">
        <p
          class="text-base font-semibold"
          :class="parsed ? 'text-primary' : 'text-muted'"
        >
          {{ headline }}
        </p>
        <p
          v-if="subline"
          class="text-xs text-muted"
        >
          {{ subline }}
        </p>
      </div>
      <NButton
        v-if="clearable && parsed"
        type="button"
        btn="ghost-gray"
        icon
        label="i-lucide-x"
        aria-label="Clear date"
        @click="emit('update:modelValue', undefined)"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <NButton
        v-for="pick in quickPicks"
        :key="pick.days"
        type="button"
        size="xs"
        :label="pick.label"
        :btn="days === pick.days ? 'soft-primary hover:outline-primary' : 'soft-gray hover:outline-gray'"
        @click="setDays(pick.days)"
      />
    </div>

    <div class="space-y-1.5">
      <p :class="FORM_LABEL_STYLE">
        Pick a date
      </p>
      <!-- Not v-model: out-of-range input is intercepted and the slider kept in sync. -->
      <NInput
        :name="name"
        type="date"
        :model-value="modelValue ?? ''"
        @update:model-value="onDateUpdate"
      />
    </div>

    <NSeparator
      label="OR"
      class="mx-2"
    />

    <div
      class="space-y-2 transition-opacity"
      :class="{ 'opacity-60': !parsed }"
    >
      <div class="flex items-baseline justify-between">
        <p :class="FORM_LABEL_STYLE">
          Choose a period
        </p>
        <p class="text-xs text-muted">
          {{ days === undefined ? '—' : `${days} ${days === 1 ? 'day' : 'days'}` }}
        </p>
      </div>
      <NSlider
        :model-value="sliderValue"
        :min="minDays"
        :max="maxDays"
        :step="1"
        @update:model-value="onPeriodUpdate"
      />
    </div>
  </div>
</template>
