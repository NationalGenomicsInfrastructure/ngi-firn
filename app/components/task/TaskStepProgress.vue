<script setup lang="ts">
import type { DisplayTaskStep } from '~~/types/productivity'
import type { TaskExecutionSource } from '~~/schemas/tasks/enums'
import { formatDate } from '~/utils/dates/formatting'
import { TASK_STEP_STATE_META } from '~/utils/tasks/meta'

/* How far a step got: its state, and who recorded which outcome once it is resolved. */

const props = defineProps<{
  step: DisplayTaskStep
}>()

const stateMeta = computed(() => TASK_STEP_STATE_META[props.step.state])

const SOURCE_LABELS: Record<TaskExecutionSource, string> = {
  scanner: 'by scanner',
  paper: 'on paper',
  online: 'online'
}
</script>

<template>
  <div class="space-y-1.5">
    <NBadge
      :label="stateMeta.label"
      :icon="stateMeta.icon"
      :badge="stateMeta.badge"
    />
    <template v-if="step.outcome">
      <IndicatorUserAvatar
        v-if="step.outcome.performedBy"
        :user="step.outcome.performedBy"
        size="2"
      />
      <p class="text-xs text-muted">
        {{ formatDate(step.outcome.performedAt ?? step.outcome.recordedAt, { time: true }) }},
        {{ SOURCE_LABELS[step.outcome.source] }}
      </p>
      <p
        v-if="step.outcome.notes"
        class="text-xs whitespace-pre-line break-words"
      >
        {{ step.outcome.notes }}
      </p>
      <p
        v-if="step.outcome.failureReason"
        class="text-xs text-error-700 dark:text-error-300 break-words"
      >
        {{ step.outcome.failureReason }}
      </p>
    </template>
  </div>
</template>
