<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
import type { FirnProjectBookmark } from '~~/types/projects-firn'

interface FormattedFirnProjectBookmark extends FirnProjectBookmark {
  projectNameFragments: string[]
}

const props = defineProps<{
  bookmarks: FirnProjectBookmark[] | undefined
  loading: boolean
}>()

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

const pagination = ref({
  pageSize: 5,
  pageIndex: 0
})

const table = useTemplateRef<Table<FormattedFirnProjectBookmark>>('table')

const formattedBookmarks = computed((): FormattedFirnProjectBookmark[] => {
  return (props.bookmarks ?? []).map(bookmark => ({
    ...bookmark,
    projectNameFragments: bookmark.projectName?.split(/[_.]/g) ?? []
  }))
})

const columns: ColumnDef<FormattedFirnProjectBookmark>[] = [
  {
    header: 'Your bookmarked projects',
    accessorKey: 'projectName',
    meta: {
      una: {
        tableHead: TABLE_HEAD_STYLE,
        tableCell: 'align-top py-1'
      }
    }
  }
]

type BookmarkDetailField = {
  label: string
  value: string
  icon: string
}

function detailsUrl(projectId: string) {
  return `/projects/details/${projectId}`
}

function getDetailFields(bookmark: FirnProjectBookmark): BookmarkDetailField[] {
  const fieldDefs: Array<{
    label: string
    key: keyof FirnProjectBookmark
    icon: string
    format?: (value: unknown) => string
  }> = [
    { label: 'Application', key: 'application', icon: 'i-lucide-microscope' },
    { label: 'Affiliation', key: 'affiliation', icon: 'i-lucide-building-2' },
    { label: 'Samples', key: 'noOfSamples', icon: 'i-lucide-test-tubes', format: v => String(v) },
    { label: 'Note', key: 'note', icon: 'i-lucide-message-square' }
  ]

  return fieldDefs
    .filter((f) => {
      const value = bookmark[f.key]
      return value != null && String(value).trim() !== ''
    })
    .map(f => ({
      label: f.label,
      value: f.format ? f.format(bookmark[f.key]) : String(bookmark[f.key]),
      icon: f.icon
    }))
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      :loading="loading"
      :columns="columns"
      :data="formattedBookmarks"
      :pagination="pagination"
      enable-sorting
      :una="{
        tableHead: TABLE_HEAD_STYLE
      }"
      empty-text="No bookmarked projects"
      empty-icon="i-radix-icons-star"
    >
      <template #projectName-cell="{ cell }">
        <NLink
          :to="detailsUrl(cell.row.original.projectId)"
          class="block py-1 w-full rounded-md transition-colors hover:bg-muted/30"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <NIcon
              name="i-radix-icons-star-filled"
              class="shrink-0 text-primary-700 dark:text-primary-400"
            />
            <span
              v-if="cell.row.original.projectNameFragments?.length"
              class="inline-flex flex-wrap items-baseline gap-x-0.5 text-sm font-semibold"
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
            <span
              v-else
              class="text-sm font-semibold text-primary-700 dark:text-primary-400"
            >
              {{ cell.row.original.projectId }}
            </span>
            <NBadge
              badge="outline"
              :label="cell.row.original.projectId"
            />
            <NBadge
              v-if="cell.row.original.priority"
              :badge="cell.row.original.priority === 'High'
                ? 'solid-error'
                : cell.row.original.priority === 'Standard'
                  ? 'solid-success'
                  : 'solid-gray'"
              :label="`Priority: ${cell.row.original.priority}`"
            />
          </div>

          <div
            v-if="getDetailFields(cell.row.original).length"
            class="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-1 text-xs w-full mt-2"
          >
            <div
              v-for="field in getDetailFields(cell.row.original)"
              :key="field.label"
              class="min-w-0"
            >
              <div class="flex items-center gap-1.5 mb-0.5">
                <NIcon
                  :name="field.icon"
                  class="text-primary-400 dark:text-primary-600 text-xs"
                />
                <span class="text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium">{{ field.label }}</span>
              </div>
              <p class="font-medium pl-5 break-words">
                {{ field.value }}
              </p>
            </div>
          </div>
        </NLink>
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
