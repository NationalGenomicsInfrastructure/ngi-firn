<script setup lang="ts">
import type { DisplayTask } from '~~/types/productivity'
import { formatDate } from '~/utils/dates/formatting'

/*
 * Due date and waiting hint of a task, as inline items for a surrounding flex row.
 * Renders nothing for a task with neither.
 */
defineProps<{
  task: DisplayTask
}>()
</script>

<template>
  <span
    v-if="task.dueDate"
    class="inline-flex items-center gap-1"
    :class="task.urgency === 'urgent' ? 'text-error font-medium' : ''"
  >
    <NIcon name="i-lucide-calendar" />
    {{ formatDate(task.dueDate, { includeWeekday: true }) }}
    ({{ formatDate(task.dueDate, { relative: true }) }})
  </span>
  <span
    v-if="task.urgencyReason === 'aged'"
    class="inline-flex items-center gap-1 text-warning font-medium"
  >
    <NIcon name="i-lucide-hourglass" />
    Waiting for a while
  </span>
</template>
