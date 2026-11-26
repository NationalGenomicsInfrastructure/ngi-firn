<script setup lang="ts">
import type { DisplayTaskStep } from '~~/types/productivity'
import type { TaskInventoryAction, TaskStepState } from '~~/schemas/tasks/enums'
import { getActionTypeMeta } from '~/utils/inventory/actionLog'
import { TASK_STEP_STATE_META } from '~/utils/tasks/meta'
import { taskProgress } from '~/utils/tasks/progress'

/*
 * The checklist at a glance: how far it is, one bar segment per step in checklist order, and
 * what kind of work it consists of. Blocked work (needs reconciliation) is called out.
 */

const props = defineProps<{
  steps: DisplayTaskStep[]
}>()

const SEGMENT_STYLE: Record<TaskStepState, string> = {
  completed: 'bg-success-500',
  skipped: 'bg-yellow-400',
  executing: 'bg-primary-500 animate-pulse',
  needs_reconciliation: 'bg-error-500',
  held: 'bg-indigo-500',
  planned: 'bg-gray-300 dark:bg-gray-700',
  cancelled: 'bg-gray-200 dark:bg-gray-800 opacity-50'
}

const stateCounts = computed(() => {
  const counts = new Map<TaskStepState, number>()
  for (const step of props.steps) counts.set(step.state, (counts.get(step.state) ?? 0) + 1)
  return counts
})

const progress = computed(() => taskProgress({
  total: props.steps.length,
  completed: stateCounts.value.get('completed') ?? 0,
  skipped: stateCounts.value.get('skipped') ?? 0,
  cancelled: stateCounts.value.get('cancelled') ?? 0
}))

const headline = computed(() => {
  const { done, of } = progress.value
  if (!of) return 'All steps cancelled'
  return `${done} of ${of} ${of === 1 ? 'step' : 'steps'} done`
})

const legend = computed(() => (Object.keys(TASK_STEP_STATE_META) as TaskStepState[]).flatMap((state) => {
  const count = stateCounts.value.get(state)
  return count ? [{ state, count, label: TASK_STEP_STATE_META[state].label }] : []
}))

/* How many steps perform each inventory action, plus the free-text ones. */
const workload = computed(() => {
  const actions = new Map<TaskInventoryAction, number>()
  let todos = 0
  for (const { payload } of props.steps) {
    if (payload.kind === 'text') todos += 1
    else actions.set(payload.action, (actions.get(payload.action) ?? 0) + 1)
  }
  const entries = [...actions].map(([action, count]) => {
    const { progressive, icon, badge } = getActionTypeMeta(action)
    return { label: `${progressive} × ${count}`, icon, badge }
  })
  if (todos) entries.push({ label: `To-do × ${todos}`, icon: 'i-lucide-list-todo', badge: 'solid-gray' })
  return entries
})

const reconciliationCount = computed(() => stateCounts.value.get('needs_reconciliation') ?? 0)

function segmentTitle(step: DisplayTaskStep, index: number) {
  const { payload } = step
  const what = payload.kind === 'text'
    ? payload.title
    : `${getActionTypeMeta(payload.action).progressive} ${payload.target.entity.name}`
  return `${index + 1}. ${what} (${TASK_STEP_STATE_META[step.state].label})`
}
</script>

<template>
  <div class="space-y-3">
    <div class="rounded-md border border-muted p-4 space-y-3">
      <div class="flex items-center gap-3">
        <NIcon
          name="i-lucide-list-checks"
          class="text-2xl text-primary shrink-0"
        />
        <p class="text-lg font-semibold">
          {{ headline }}
        </p>
      </div>

      <!-- Decorative for screen readers: the legend and the table below carry the same information. -->
      <div
        class="flex gap-0.5 h-3"
        aria-hidden="true"
      >
        <div
          v-for="(step, index) in steps"
          :key="step.stepId"
          class="flex-1 min-w-0 first:rounded-l-full last:rounded-r-full"
          :class="SEGMENT_STYLE[step.state]"
          :title="segmentTitle(step, index)"
        />
      </div>

      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li
          v-for="entry in legend"
          :key="entry.state"
          class="flex items-center gap-1.5"
        >
          <span
            class="size-3 rounded-sm shrink-0"
            :class="SEGMENT_STYLE[entry.state]"
            aria-hidden="true"
          />
          {{ entry.label }}
          <span class="font-semibold">{{ entry.count }}</span>
        </li>
      </ul>

      <div class="flex flex-wrap gap-1.5">
        <NBadge
          v-for="entry in workload"
          :key="entry.label"
          :label="entry.label"
          :icon="entry.icon"
          :badge="entry.badge"
        />
      </div>
    </div>

    <NAlert
      v-if="reconciliationCount"
      alert="soft-error"
      :title="`${reconciliationCount} ${reconciliationCount === 1 ? 'step needs' : 'steps need'} reconciliation`"
      description="It is unclear whether the physical work was done. The inventory stays held until someone confirms what happened."
      icon="i-lucide-triangle-alert"
    />
  </div>
</template>
