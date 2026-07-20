<script setup lang="ts">
import type { ColumnDef, Table, VisibilityState } from '@tanstack/vue-table'
import type { ProjectSample } from '~~/types/projects'

interface SampleRow {
  sampleId: string
  scilifeName: string
  customerName: string
  sampleType: string
  progress: string
  statusAuto: string
  statusManual: string
  passedInitialQc: string
  passedLibraryQc: string
  passedSequencingQc: string
  totalReads: string
}

const props = defineProps<{
  samples: Record<string, ProjectSample>
  loading?: boolean
}>()

function roundNum(val: unknown, decimals = 2): string {
  if (val == null) return '—'
  const n = Number(val)
  if (Number.isNaN(n)) return String(val)
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(decimals)
}

const TABLE_HEAD_STYLE = 'text-left bg-primary-700 dark:bg-primary-900 border-b-2 border-primary-100 dark:border-primary-400 text-primary-100 dark:text-primary-400 [&_button]:bg-transparent [&_button]:text-primary-100 [&_button]:hover:bg-primary-600 [&_button]:hover:text-primary-50 dark:[&_button]:bg-transparent dark:[&_button]:text-primary-400 dark:[&_button]:hover:bg-primary-800 dark:[&_button]:hover:text-primary-300'

const columns: ColumnDef<SampleRow>[] = [
  {
    header: 'Sample ID',
    accessorKey: 'sampleId',
    meta: {
      una: {
        tableCell: 'text-primary-700 dark:text-primary-400 font-semibold',
        tableHead: TABLE_HEAD_STYLE
      }
    }
  },
  {
    header: 'Customer name',
    accessorKey: 'customerName'
  },
  {
    header: 'Sample type',
    accessorKey: 'sampleType'
  },
  {
    header: 'Progress',
    accessorKey: 'progress'
  },
  {
    header: 'Status (auto)',
    accessorKey: 'statusAuto'
  },
  {
    header: 'Status (manual)',
    accessorKey: 'statusManual'
  },
  {
    header: 'Initial QC',
    accessorKey: 'passedInitialQc'
  },
  {
    header: 'Library QC',
    accessorKey: 'passedLibraryQc'
  },
  {
    header: 'Total reads (M)',
    accessorKey: 'totalReads'
  }
]

const tableData = computed((): SampleRow[] => {
  return Object.entries(props.samples).map(([sampleId, sample]) => ({
    sampleId,
    scilifeName: sample.scilife_name ?? sampleId,
    customerName: sample.customer_name ?? sample.details?.customer_name ?? '—',
    sampleType: sample.details?.sample_type ?? '—',
    progress: sample.details?.progress ?? '—',
    statusAuto: sample.details?.['status_(auto)'] ?? '—',
    statusManual: sample.details?.['status_(manual)'] ?? '—',
    passedInitialQc: sample.details?.passed_initial_qc ?? '—',
    passedLibraryQc: sample.details?.passed_library_qc ?? '—',
    passedSequencingQc: sample.details?.passed_sequencing_qc ?? '—',
    totalReads: roundNum(sample.details?.['total_reads_(m)'])
  }))
})

const pagination = ref({
  pageSize: 20,
  pageIndex: 0
})

const expanded = ref<Record<string, boolean>>({})
const table = useTemplateRef<Table<SampleRow>>('table')

const columnVisibility = ref<VisibilityState>({
  sampleType: false,
  progress: false,
  statusAuto: false
})

function getSampleByRow(row: SampleRow): ProjectSample | undefined {
  return props.samples[row.sampleId]
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NSeparator class="mt-4" />
    <div class="flex flex-wrap gap-4">
      <NCheckbox
        v-for="tableColumn in (table?.getAllLeafColumns() ?? []).filter((col) => col.id !== 'expanded')"
        :key="tableColumn.id"
        :model-value="tableColumn.getIsVisible()"
        :label="tableColumn.id"
        @update:model-value="tableColumn.toggleVisibility()"
      />
    </div>
    <NSeparator />
    {{ columnVisibility.value }}
    <NTable
      ref="table"
      v-model:expanded="expanded"
      v-model:column-visibility="columnVisibility"
      :loading="loading"
      :columns="columns"
      :data="tableData"
      :una="{
        tableHead: TABLE_HEAD_STYLE
      }"
      :default-sort="{
        id: 'sampleId',
        desc: false
      }"
      :pagination="pagination"
      enable-sorting
      enable-multi-sort
      empty-text="No samples in this project"
      empty-icon="i-lucide-test-tubes"
    >
      <template #statusAuto-cell="{ cell }">
        <NBadge
          :badge="cell.row.original.statusAuto === 'Finished'
            ? 'solid-success'
            : cell.row.original.statusAuto === 'In Progress'
              ? 'solid-primary'
              : 'outline-gray'"
          :label="cell.row.original.statusAuto"
        />
      </template>
      <template #statusManual-cell="{ cell }">
        <NBadge
          :badge="cell.row.original.statusManual === 'Finished'
            ? 'solid-success'
            : cell.row.original.statusManual === 'Aborted'
              ? 'solid-error'
              : cell.row.original.statusManual === 'In Progress'
                ? 'solid-primary'
                : 'outline-gray'"
          :label="cell.row.original.statusManual"
        />
      </template>
      <template #passedInitialQc-cell="{ cell }">
        <NBadge
          v-if="cell.row.original.passedInitialQc !== '—'"
          :badge="cell.row.original.passedInitialQc === 'True' ? 'solid-success' : 'solid-error'"
          :label="cell.row.original.passedInitialQc === 'True' ? 'Passed' : 'Failed'"
          :icon="cell.row.original.passedInitialQc === 'True' ? 'i-lucide-check' : 'i-lucide-x'"
        />
        <span
          v-else
          class="text-muted"
        >—</span>
      </template>
      <template #passedLibraryQc-cell="{ cell }">
        <NBadge
          v-if="cell.row.original.passedLibraryQc !== '—'"
          :badge="cell.row.original.passedLibraryQc === 'True' ? 'solid-success' : 'solid-error'"
          :label="cell.row.original.passedLibraryQc === 'True' ? 'Passed' : 'Failed'"
          :icon="cell.row.original.passedLibraryQc === 'True' ? 'i-lucide-check' : 'i-lucide-x'"
        />
        <span
          v-else
          class="text-muted"
        >—</span>
      </template>

      <template #expanded="{ row }">
        <div class="-m-4 p-4 border-l-18 border-primary-700 dark:border-primary-900">
          <div class="flex justify-center my-3 p-2 bg-gray-100 dark:bg-gray-800 w-full">
            <h2 class="text-center text-xl font-semibold tracking-tight">
              {{ row.original.sampleId }}
            </h2>
          </div>
          <div class="p-4 text-sm bg-muted/30 rounded-md">
            <div class="flex items-center gap-2 mb-3">
              <NIcon
                name="i-lucide-info"
                class="text-muted"
              />
              <h5 class="font-semibold text-sm">
                Sample details
              </h5>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
              <IndicatorIconText
                icon="i-lucide-hash"
                label="Plate ID"
                :value="getSampleByRow(row.original)?.initial_plate_id"
              />
              <IndicatorIconText
                icon="i-lucide-map-pin"
                label="Well location"
                :value="getSampleByRow(row.original)?.well_location"
              />
              <IndicatorIconText
                icon="i-lucide-calendar-check"
                label="First initial QC"
                :value="getSampleByRow(row.original)?.first_initial_qc_start_date"
              />
              <IndicatorIconText
                icon="i-lucide-calendar-plus"
                label="First prep start"
                :value="getSampleByRow(row.original)?.first_prep_start_date"
              />
              <IndicatorIconText
                icon="i-lucide-flask-conical"
                label="Finished library"
                :value="getSampleByRow(row.original)?.isFinishedLib != null ? (getSampleByRow(row.original)!.isFinishedLib ? 'Yes' : 'No') : '—'"
              />
              <IndicatorIconText
                v-if="getSampleByRow(row.original)?.details?.species_name"
                icon="i-lucide-dna"
                label="Species"
                :value="getSampleByRow(row.original)?.details?.species_name"
              />
              <IndicatorIconText
                v-if="getSampleByRow(row.original)?.details?.tissue_type"
                icon="i-lucide-test-tubes"
                label="Tissue type"
                :value="getSampleByRow(row.original)?.details?.tissue_type"
              />
              <IndicatorIconText
                v-if="getSampleByRow(row.original)?.details?.storage_type"
                icon="i-lucide-package"
                label="Storage"
                :value="getSampleByRow(row.original)?.details?.storage_type"
              />
            </div>

            <div
              v-if="getSampleByRow(row.original)?.initial_qc"
              class="mt-4"
            >
              <NSeparator class="mb-3" />
              <div class="flex items-center gap-2 mb-3">
                <NIcon
                  name="i-lucide-flask-conical"
                  class="text-muted"
                />
                <h5 class="font-semibold text-sm">
                  Initial QC
                </h5>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-4">
                <IndicatorIconText
                  v-if="getSampleByRow(row.original)?.initial_qc?.initial_qc_status"
                  icon="i-lucide-circle-check"
                  label="QC status"
                  :value="getSampleByRow(row.original)?.initial_qc?.initial_qc_status"
                />
                <IndicatorIconText
                  v-if="getSampleByRow(row.original)?.initial_qc?.concentration != null"
                  icon="i-lucide-flask-conical"
                  label="Concentration"
                >
                  {{ roundNum(getSampleByRow(row.original)?.initial_qc?.concentration) }} {{ getSampleByRow(row.original)?.initial_qc?.conc_units ?? '' }}
                </IndicatorIconText>
                <IndicatorIconText
                  v-if="getSampleByRow(row.original)?.initial_qc?.['volume_(ul)'] != null"
                  icon="i-lucide-beaker"
                  label="Volume (ul)"
                  :value="roundNum(getSampleByRow(row.original)?.initial_qc?.['volume_(ul)'])"
                />
                <IndicatorIconText
                  v-if="getSampleByRow(row.original)?.initial_qc?.['size_(bp)'] != null"
                  icon="i-lucide-ruler"
                  label="Size (bp)"
                  :value="roundNum(getSampleByRow(row.original)?.initial_qc?.['size_(bp)'], 0)"
                />
                <IndicatorIconText
                  v-if="getSampleByRow(row.original)?.initial_qc?.['amount_(ng)'] != null"
                  icon="i-lucide-scale"
                  label="Amount (ng)"
                  :value="roundNum(getSampleByRow(row.original)?.initial_qc?.['amount_(ng)'])"
                />
              </div>
            </div>

            <StepperSampleTimeline
              :sample="getSampleByRow(row.original)"
              :sample-id="row.original.sampleId"
            />
          </div>
        </div>
      </template>
    </NTable>

    <div
      v-if="table?.getFilteredRowModel().rows.length ?? 0 > 20"
      class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4"
    >
      <div class="flex items-center justify-center text-sm font-medium">
        Page {{ (table?.getState().pagination.pageIndex ?? 0) + 1 }} of
        {{ table?.getPageCount().toLocaleString() }}
      </div>

      <NPagination
        :page="(table?.getState().pagination.pageIndex ?? 0) + 1"
        :total="table?.getFilteredRowModel().rows.length"
        show-edges
        :items-per-page="table?.getState().pagination.pageSize ?? 20"
        @update:page="table?.setPageIndex($event - 1)"
      />
    </div>
  </div>
</template>
