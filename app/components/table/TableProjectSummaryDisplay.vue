<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import type { ProjectSummaryListItemSchema } from '~~/schemas/projects'
import { formatDate } from '~/utils/dates/formatting'

interface FormattedProjectSummary extends ProjectSummaryListItemSchema {
  open_dateFormatted: string
  close_dateFormatted: string
  modification_timeFormatted: string
  projectNameFragments: string[]
}

const props = defineProps<{
  projects: ProjectSummaryListItemSchema[] | undefined
  loading: boolean
}>()

const columns: ColumnDef<FormattedProjectSummary>[] = [
  {
    header: 'Project ID',
    accessorKey: 'project_id',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }
    }
  },
  {
    header: 'Project name',
    accessorKey: 'project_name'
  },
  {
    header: 'Application',
    accessorKey: 'application'
  },
  {
    header: 'No. samples',
    accessorKey: 'no_samples'
  },
  {
    header: 'Open date',
    accessorKey: 'open_date'
  },
  {
    header: 'Status',
    accessorKey: 'status'
  }
]

const pagination = ref({
  pageSize: 10,
  pageIndex: 0
})

const expanded = ref<Record<string, boolean>>({})
const table = useTemplateRef<Table<FormattedProjectSummary>>('table')

const relativeDates = ref(false)
const includeWeekday = ref(false)
const displayTime = ref(false)

const formattedProjects = computed((): FormattedProjectSummary[] | undefined => {
  return props.projects?.map((project) => {
    const formatOptions = {
      relative: relativeDates.value,
      includeWeekday: includeWeekday.value,
      time: displayTime.value
    }
    return {
      ...project,
      open_dateFormatted: formatDate(project.open_date, formatOptions),
      close_dateFormatted: formatDate(project.close_date, formatOptions),
      modification_timeFormatted: formatDate(project.modification_time, formatOptions),
      projectNameFragments: project.project_name?.split(/[_.]/g) ?? []
    }
  })
})

watch(relativeDates, (isRelative) => {
  if (!isRelative) return
  if (includeWeekday.value) includeWeekday.value = false
  if (displayTime.value) displayTime.value = false
})

watch([includeWeekday, displayTime], ([weekday, time]) => {
  if (!(weekday || time)) return
  if (relativeDates.value) relativeDates.value = false
})
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <NFormGroup
      :label="relativeDates ? 'Dates: relative' : 'Dates: absolute'"
    >
      <NSwitch
        v-model="relativeDates"
      />
    </NFormGroup>
    <NFormGroup
      :label="includeWeekday ? 'Weekdays: show' : 'Weekdays: hide'"
    >
      <NSwitch
        v-model="includeWeekday"
      />
    </NFormGroup>
    <NFormGroup
      :label="displayTime ? 'Time: show' : 'Time: hide'"
    >
      <NSwitch
        v-model="displayTime"
      />
    </NFormGroup>
  </div>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="formattedProjects || []"
      :una="{
        tableHead: 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'
      }"
      :default-sort="{
        id: 'modification_time',
        desc: true
      }"
      :pagination="pagination"
      enable-sorting
      enable-multi-sort
      empty-text="No projects"
      empty-icon="i-lucide-folder"
    >
      <template #open_date-cell="{ cell }">
        {{ cell.row.original.open_dateFormatted }}
      </template>
      <template #project_name-cell="{ cell }">
        <NAvatarGroup
          :max="2"
        >
          <NAvatar
            v-if="cell.row.original.projectNameFragments[2]"
            avatar="soft-gray"
            size="xs lg:sm"
            rounded="l-full r-none"
            :label="cell.row.original.projectNameFragments[2]"
          />
          <NAvatar
            v-if="cell.row.original.projectNameFragments[3]"
            avatar="soft-primary"
            size="xs lg:sm"
            rounded="l-none r-full"
            :label=" cell.row.original.projectNameFragments[3]"
          />
        </NAvatarGroup>
        <h3 class="text-primary-500 dark:text-primary-200 font-semibold leading-none mt-2">
          {{ cell.row.original.projectNameFragments[0] }} {{ cell.row.original.projectNameFragments[1] }}
        </h3>
      </template>
      <template #status-cell="{ cell }">
        <NBadge
          :una="{
            badgeDefaultVariant: cell.row.original.status === 'open' ? 'badge-soft' : 'badge-soft-gray'
          }"
          class="capitalize"
          :label="cell.row.original.status ?? '—'"
        />
      </template>

      <template #expanded="{ row }">
        <div class="p-2 flex flex-row items-start gap-4">
          <div class="flex flex-col gap-2 text-sm flex-1">
            <div>
              <span class="font-semibold mr-2">Affiliation:</span>
              <span> {{ row.original.affiliation ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Contact:</span>
              <span> {{ row.original.contact ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Priority:</span>
              <span> {{ row.original.priority ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Open date:</span>
              <span> {{ row.original.open_dateFormatted ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Modification time:</span>
              <span> {{ row.original.modification_timeFormatted ?? '—' }}</span>
            </div>
            <div>
              <span class="font-semibold mr-2">Close date:</span>
              <span> {{ row.original.close_dateFormatted ?? '—' }}</span>
            </div>
          </div>
        </div>
      </template>
    </NTable>
    <div
      class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4"
    >
      <div
        class="flex items-center justify-center text-sm font-medium"
      >
        Page {{ (table?.getState().pagination.pageIndex ?? 0) + 1 }} of
        {{ table?.getPageCount().toLocaleString() }}
      </div>

      <NPagination
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 5"
        @update:page="table?.setPageIndex($event - 1)"
      />
    </div>
  </div>
</template>
