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

const formattedProjects = computed((): FormattedProjectSummary[] | undefined => {
  return props.projects?.map((project) => {
    const formatOptions = {
      relative: relativeDates.value,
      includeWeekday: includeWeekday.value,
      time: false
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
})

watch(includeWeekday, (isRelative) => {
  if (!isRelative) return
  if (relativeDates.value) relativeDates.value = false
})
</script>

<template>
  <div class="w-full flex justify-center mb-6">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-8">
      <NFormGroup
        :label="relativeDates ? 'Dates: relative' : 'Dates: absolute'"
        :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
      >
        <NSwitch
          v-model="relativeDates"
        />
      </NFormGroup>
      <NFormGroup
        :label="includeWeekday ? 'Weekdays: show' : 'Weekdays: hide'"
        :una="{ formGroupLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }"
      >
        <NSwitch
          v-model="includeWeekday"
        />
      </NFormGroup>
    </div>
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
        <span
          v-if="cell.row.original.projectNameFragments?.length"
          class="inline-flex flex-wrap items-baseline gap-x-0.5"
        >
          <span class="prose prose-primary">{{ cell.row.original.projectNameFragments[0] }}</span>
          <span v-if="cell.row.original.projectNameFragments[1]">{{ cell.row.original.projectNameFragments[1] }}&nbsp;</span>
          <template v-if="cell.row.original.projectNameFragments[2]">
            <span class="prose-sm tabular-nums text-primary-300 dark:text-primary-200">{{ cell.row.original.projectNameFragments[2] }}</span>
          </template> /
          <template v-if="cell.row.original.projectNameFragments[3]">
            <span class="prose-sm tabular-nums text-primary-300 dark:text-primary-200">{{ cell.row.original.projectNameFragments[3] }}</span>
          </template>
        </span>
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
        <div class="flex justify-center my-3 p-2 bg-gray-100 dark:bg-gray-800">
          <h2 class="text-center text-xl font-semibold tracking-tight">
            {{ [row.original.projectNameFragments[0],".", row.original.projectNameFragments[1], "(",row.original.project_id,")"].filter(Boolean).join(' ') }}

          </h2>
        </div>
        <div class="p-2 flex flex-row items-start gap-4">
          <!-- Column 1: Avatars and badges -->
          <div class="flex flex-col items-center gap-2 flex-shrink-0">
            <NAvatarGroup :max="2">
              <NAvatar
                :avatar="row.original.status === 'open' ? 'outline-primary' : 'outline-gray'"
                :label="row.original.projectNameFragments[2] ?? '—'"
                size="sm:md md:lg lg:xl"
              />
              <NAvatar
                :avatar="row.original.status === 'open' ? 'outline-primary' : 'outline-gray'"
                :label="row.original.projectNameFragments[3] ?? '—'"
                size="sm:lg md:xl lg:2xl"
              />
            </NAvatarGroup>
          </div>

          <!-- Column 2: Textual information -->
          <div class="flex flex-col gap-3 text-sm flex-1 ml-10">
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-building-2"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Affiliation</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.affiliation ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-user"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Contact</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.contact ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-signal"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Priority</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.priority ?? '—' }}
              </p>
            </div>
          </div>

          <!-- Column 3: Dates -->
          <div class="flex flex-col gap-3 text-sm flex-1">
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-calendar"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Open date</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.open_dateFormatted ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-clock"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Modification time</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.modification_timeFormatted ?? '—' }}
              </p>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  name="i-lucide-calendar-check"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">Close date</span>
              </div>
              <p class="font-medium pl-5">
                {{ row.original.close_dateFormatted ?? '—' }}
              </p>
            </div>
          </div>

          <!-- Column 4: Button -->
          <div class="flex flex-col items-end flex-shrink-0 gap-2">
            <NButton
              label="View project details"
              class="w-full transition delay-300 ease-in-out"
              btn="soft-primary hover:outline-primary"
              leading="i-lucide-eye"
              :to="`/projects/details/${row.original.project_id}`"
            />
          </div>
        </div>
        <div class="p-2 flex flex-row items-start gap-4" />
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
