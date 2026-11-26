<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { DisplayTaskStep } from '~~/types/productivity'

/*
 * A task's checklist in order. Each row says what to do (an inventory action on a target, or a
 * free-text to-do), where it happens, and how far it got.
 */

const props = withDefaults(defineProps<{
  steps: DisplayTaskStep[]
  loading?: boolean
}>(), {
  loading: false
})

interface TaskStepRow {
  stepId: string
  /* Position in the checklist; the stored `order` may have gaps after removals. */
  number: number
  step: DisplayTaskStep
  /* Checklist numbers of the prerequisite steps. */
  after: number[]
}

const rows = computed((): TaskStepRow[] => {
  const numbers = new Map(props.steps.map((step, index) => [step.stepId, index + 1]))
  return props.steps.map((step, index) => ({
    stepId: step.stepId,
    number: index + 1,
    step,
    after: step.dependsOn.flatMap(id => numbers.get(id) ?? []).sort((a, b) => a - b)
  }))
})

// NTable pages after ten rows unless told otherwise; a checklist is always shown whole.
const pagination = computed(() => ({ pageIndex: 0, pageSize: Math.max(rows.value.length, 1) }))

const TABLE_HEAD_STYLE = 'text-left bg-muted/40 border-b border-muted text-muted text-xs font-medium'

function column(id: string, header: string, tableCell = 'align-top py-3'): ColumnDef<TaskStepRow> {
  return { id, header, accessorKey: 'stepId', meta: { una: { tableHead: TABLE_HEAD_STYLE, tableCell } } }
}

const columns: ColumnDef<TaskStepRow>[] = [
  column('number', '#', 'align-top py-3 w-10 font-semibold text-muted'),
  column('step', 'Step', 'align-top py-3 min-w-72 whitespace-normal'),
  column('location', 'Where', 'align-top py-3 min-w-48 whitespace-normal'),
  column('state', 'State', 'align-top py-3 min-w-36 whitespace-normal')
]
</script>

<template>
  <section class="min-w-0 overflow-x-auto rounded-md border border-muted">
    <NTable
      row-id="stepId"
      :loading="loading"
      :columns="columns"
      :data="rows"
      :pagination="pagination"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      empty-text="No steps planned yet"
      empty-icon="i-lucide-list-checks"
    >
      <template #number-cell="{ cell }">
        {{ cell.row.original.number }}
      </template>

      <template #step-cell="{ cell }">
        <TaskStepDefinition
          :step="cell.row.original.step"
          :after="cell.row.original.after"
        />
      </template>

      <template #location-cell="{ cell }">
        <TaskStepLocation :step="cell.row.original.step" />
      </template>

      <template #state-cell="{ cell }">
        <TaskStepProgress :step="cell.row.original.step" />
      </template>
    </NTable>
  </section>
</template>
