<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { DisplayTask } from '~~/types/productivity'
import { formatDate } from '~/utils/dates/formatting'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  icon?: string
  tasks: DisplayTask[]
  loading?: boolean
  emptyText?: string
}>(), {
  description: undefined,
  icon: undefined,
  loading: false,
  emptyText: 'No tasks'
})

// Deliberately quieter than the bookmarks table: muted background, small caps-free text.
const TABLE_HEAD_STYLE = 'text-left bg-muted/40 border-b border-muted text-muted text-xs font-medium'

const columns = computed((): ColumnDef<DisplayTask>[] => [
  {
    header: props.title,
    accessorKey: 'title',
    meta: { una: { tableHead: TABLE_HEAD_STYLE, tableCell: 'align-top py-1' } }
  }
])

function responsibleNames(task: DisplayTask) {
  return task.responsibleUsers.map(user => user.name).join(', ')
}

function taskUrl(slug: string) {
  return `/tasks/details/${slug}`
}

/* Steps still relevant for progress: cancelled steps drop out of the denominator. */
function progressOf(task: DisplayTask) {
  const { total, cancelled, completed, skipped } = task.progress
  return { done: completed + skipped, of: total - cancelled }
}
</script>

<template>
  <section class="min-w-0 rounded-md border border-muted">
    <NTable
      :loading="loading"
      :columns="columns"
      :data="tasks"
      :una="{ tableHead: TABLE_HEAD_STYLE }"
      :empty-text="emptyText"
      :empty-icon="icon"
    >
      <template #title-header="{ column }">
        <div class="flex items-center gap-2 py-1">
          <NIcon
            v-if="icon"
            :name="icon"
          />
          <span class="font-semibold">{{ column.columnDef.header }}</span>
          <span
            v-if="description"
            class="font-normal hidden sm:inline"
          >· {{ description }}</span>
          <NBadge
            badge="soft-gray"
            :label="String(tasks.length)"
            class="ml-auto"
          />
        </div>
      </template>

      <template #title-cell="{ cell }">
        <NLink
          :to="taskUrl(cell.row.original.slug)"
          class="block py-1 w-full rounded-md transition-colors hover:bg-muted/30"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-semibold">{{ cell.row.original.title }}</span>
            <NBadge
              v-if="cell.row.original.status === 'draft'"
              badge="outline"
              label="Draft"
            />
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted">
            <span
              v-if="cell.row.original.dueDate"
              class="inline-flex items-center gap-1"
              :class="cell.row.original.urgency === 'urgent' ? 'text-error font-medium' : ''"
            >
              <NIcon name="i-lucide-calendar" />
              {{ formatDate(cell.row.original.dueDate, { includeWeekday: true }) }}
              ({{ formatDate(cell.row.original.dueDate, { relative: true }) }})
            </span>
            <span
              v-if="cell.row.original.urgencyReason === 'aged'"
              class="inline-flex items-center gap-1 text-warning font-medium"
            >
              <NIcon name="i-lucide-hourglass" />
              Waiting for a while
            </span>
            <span
              v-if="progressOf(cell.row.original).of > 0"
              class="inline-flex items-center gap-1"
            >
              <NIcon name="i-lucide-list-checks" />
              {{ progressOf(cell.row.original).done }} / {{ progressOf(cell.row.original).of }} steps
            </span>
            <span
              v-if="cell.row.original.responsibleUsers.length"
              class="inline-flex items-center gap-1"
            >
              <NIcon name="i-lucide-user" />
              {{ responsibleNames(cell.row.original) }}
            </span>
          </div>
        </NLink>
      </template>
    </NTable>
  </section>
</template>
