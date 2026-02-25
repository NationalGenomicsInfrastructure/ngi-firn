<script setup lang="ts">
import type { ColumnDef, Table } from '@tanstack/vue-table'
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
    totalReads: sample.details?.['total_reads_(m)'] != null
      ? String(sample.details['total_reads_(m)'])
      : '—'
  }))
})

const pagination = ref({
  pageSize: 20,
  pageIndex: 0
})

const expanded = ref<Record<string, boolean>>({})
const table = useTemplateRef<Table<SampleRow>>('table')

function getSampleByRow(row: SampleRow): ProjectSample | undefined {
  return props.samples[row.sampleId]
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <NTable
      ref="table"
      v-model:expanded="expanded"
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
            ? 'soft-gray'
            : cell.row.original.statusAuto === 'In Progress'
              ? 'soft-primary'
              : 'outline-gray'"
          :label="cell.row.original.statusAuto"
        />
      </template>
      <template #statusManual-cell="{ cell }">
        <NBadge
          :badge="cell.row.original.statusManual === 'Finished'
            ? 'soft-gray'
            : cell.row.original.statusManual === 'Aborted'
              ? 'solid-error'
              : cell.row.original.statusManual === 'In Progress'
                ? 'soft-primary'
                : 'outline-gray'"
          :label="cell.row.original.statusManual"
        />
      </template>
      <template #passedInitialQc-cell="{ cell }">
        <NBadge
          v-if="cell.row.original.passedInitialQc !== '—'"
          :badge="cell.row.original.passedInitialQc === 'True' ? 'soft-primary' : 'outline-gray'"
          :label="cell.row.original.passedInitialQc"
        />
        <span
          v-else
          class="text-muted"
        >—</span>
      </template>
      <template #passedLibraryQc-cell="{ cell }">
        <NBadge
          v-if="cell.row.original.passedLibraryQc !== '—'"
          :badge="cell.row.original.passedLibraryQc === 'True' ? 'soft-primary' : 'outline-gray'"
          :label="cell.row.original.passedLibraryQc"
        />
        <span
          v-else
          class="text-muted"
        >—</span>
      </template>

      <template #expanded="{ row }">
        <div class="p-4 space-y-3 text-sm">
          <template v-if="getSampleByRow(row.original)">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
              <div>
                <span class="font-semibold text-muted">Plate ID</span>
                <p>{{ getSampleByRow(row.original)?.initial_plate_id ?? '—' }}</p>
              </div>
              <div>
                <span class="font-semibold text-muted">Well location</span>
                <p>{{ getSampleByRow(row.original)?.well_location ?? '—' }}</p>
              </div>
              <div>
                <span class="font-semibold text-muted">First initial QC</span>
                <p>{{ getSampleByRow(row.original)?.first_initial_qc_start_date ?? '—' }}</p>
              </div>
              <div>
                <span class="font-semibold text-muted">First prep start</span>
                <p>{{ getSampleByRow(row.original)?.first_prep_start_date ?? '—' }}</p>
              </div>
              <div>
                <span class="font-semibold text-muted">Finished library</span>
                <p>{{ getSampleByRow(row.original)?.isFinishedLib != null ? String(getSampleByRow(row.original)!.isFinishedLib) : '—' }}</p>
              </div>
              <div v-if="getSampleByRow(row.original)?.details?.species_name">
                <span class="font-semibold text-muted">Species</span>
                <p>{{ getSampleByRow(row.original)?.details?.species_name }}</p>
              </div>
              <div v-if="getSampleByRow(row.original)?.details?.tissue_type">
                <span class="font-semibold text-muted">Tissue type</span>
                <p>{{ getSampleByRow(row.original)?.details?.tissue_type }}</p>
              </div>
              <div v-if="getSampleByRow(row.original)?.details?.storage_type">
                <span class="font-semibold text-muted">Storage</span>
                <p>{{ getSampleByRow(row.original)?.details?.storage_type }}</p>
              </div>
            </div>

            <div
              v-if="getSampleByRow(row.original)?.initial_qc"
              class="mt-3"
            >
              <h5 class="font-semibold text-muted mb-1">
                Initial QC
              </h5>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                <div v-if="getSampleByRow(row.original)?.initial_qc?.initial_qc_status">
                  <span class="font-medium text-muted">QC status</span>
                  <p>{{ getSampleByRow(row.original)?.initial_qc?.initial_qc_status }}</p>
                </div>
                <div v-if="getSampleByRow(row.original)?.initial_qc?.concentration != null">
                  <span class="font-medium text-muted">Concentration</span>
                  <p>{{ getSampleByRow(row.original)?.initial_qc?.concentration }} {{ getSampleByRow(row.original)?.initial_qc?.conc_units ?? '' }}</p>
                </div>
                <div v-if="getSampleByRow(row.original)?.initial_qc?.['volume_(ul)'] != null">
                  <span class="font-medium text-muted">Volume (ul)</span>
                  <p>{{ getSampleByRow(row.original)?.initial_qc?.['volume_(ul)'] }}</p>
                </div>
                <div v-if="getSampleByRow(row.original)?.initial_qc?.['size_(bp)'] != null">
                  <span class="font-medium text-muted">Size (bp)</span>
                  <p>{{ getSampleByRow(row.original)?.initial_qc?.['size_(bp)'] }}</p>
                </div>
                <div v-if="getSampleByRow(row.original)?.initial_qc?.['amount_(ng)'] != null">
                  <span class="font-medium text-muted">Amount (ng)</span>
                  <p>{{ getSampleByRow(row.original)?.initial_qc?.['amount_(ng)'] }}</p>
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>
    </NTable>

    <div class="flex flex-wrap items-center justify-between gap-4 overflow-auto px-2 mt-4">
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
