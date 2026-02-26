import { DateTime } from 'luxon'
import type { Project } from '~~/types/projects'

export interface TimelineEntry {
  date: DateTime
  label: string
  source: string
  context?: string
}

const DATE_LABELS: Record<string, string> = {
  open_date: 'Open date',
  close_date: 'Close date',
  modification_time: 'Modified',
  creation_time: 'Created',
  created: 'Order created',
  modified: 'Order modified',
  order_received: 'Order received',
  contract_received: 'Contract received',
  contract_sent: 'Contract sent',
  plates_sent: 'Plates sent',
  sample_information_received: 'Sample information received',
  samples_received: 'Samples received',
  queued: 'Queued',
  disposal_of_any_remaining_samples: 'Disposal of remaining samples',
  all_samples_sequenced: 'All samples sequenced',
  all_raw_data_delivered: 'All raw data delivered',
  signature_queued: 'Signature queued',
  signature_all_samples_sequenced: 'Signature all samples sequenced',
  signature_all_raw_data_delivered: 'Signature all raw data delivered',
  signature_aborted: 'Signature aborted',
  shared: 'Shared',
  start_date: 'Start date',
  finish_date: 'Finish date',
  first_initial_qc_start_date: 'First initial QC start',
  first_prep_start_date: 'First prep start',
  prep_start_date: 'Prep start',
  prep_finished_date: 'Prep finished',
  pre_prep_start_date: 'Pre-prep start',
  sequencing_start_date: 'Sequencing start',
  sequencing_finish_date: 'Sequencing finish',
  dillution_and_pooling_start_date: 'Dilution and pooling start',
  sequencing_run_QC_finished: 'Sequencing run QC finished',
  last_modified: 'Last modified'
}

function parseDate(value: unknown): DateTime | null {
  if (value == null || typeof value !== 'string' || value.trim() === '')
    return null
  const dt = DateTime.fromISO(value)
  if (dt.isValid) return dt
  const dtOther = DateTime.fromFormat(value, 'yyyy-MM-dd')
  if (dtOther.isValid) return dtOther
  return null
}

function addEntry(
  entries: TimelineEntry[],
  value: unknown,
  label: string,
  source: string,
  context?: string
): void {
  const dt = parseDate(value)
  if (dt) entries.push({ date: dt, label, source, context })
}

function collectFromRecord(
  record: Record<string, unknown> | undefined,
  keys: string[],
  source: string,
  context?: string
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  if (!record) return entries
  for (const key of keys) {
    const v = record[key]
    if (v == null) continue
    const label = DATE_LABELS[key] ?? key.replace(/_/g, ' ')
    addEntry(entries, v, label, source, context)
  }
  return entries
}

const DETAILS_DATE_KEYS = [
  'order_received', 'contract_received', 'contract_sent', 'plates_sent',
  'sample_information_received', 'samples_received', 'queued',
  'disposal_of_any_remaining_samples', 'all_samples_sequenced',
  'all_raw_data_delivered', 'signature_queued', 'signature_all_samples_sequenced',
  'signature_all_raw_data_delivered', 'signature_aborted', 'shared'
]

const SUMMARY_DATE_KEYS = [
  'queued', 'signature_queued', 'signature_all_samples_sequenced',
  'signature_all_raw_data_delivered', 'all_samples_sequenced', 'all_raw_data_delivered'
]

export function getProjectTimelineEntries(project: Project | undefined | null): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  if (!project) return entries

  const rootDates = [
    { key: 'open_date', label: 'Open date' },
    { key: 'close_date', label: 'Close date' },
    { key: 'modification_time', label: 'Modified' },
    { key: 'creation_time', label: 'Created' }
  ]
  for (const { key, label } of rootDates) {
    const v = (project as Record<string, unknown>)[key]
    addEntry(entries, v, label, 'project')
  }

  const orderDetails = project.order_details as Record<string, unknown> | undefined
  entries.push(...collectFromRecord(orderDetails, ['created', 'modified'], 'order'))

  const details = project.details as Record<string, unknown> | undefined
  entries.push(...collectFromRecord(details, DETAILS_DATE_KEYS, 'details'))

  const summary = project.project_summary as Record<string, unknown> | undefined
  entries.push(...collectFromRecord(summary, SUMMARY_DATE_KEYS, 'summary'))

  entries.sort((a, b) => a.date.toMillis() - b.date.toMillis())
  return entries
}

/**
 * Collects all date-bearing fields for a single sample (initial QC, library prep,
 * library validation, sample run metrics). Use for per-sample timeline display.
 */
export function getSampleTimelineEntries(
  sample: Record<string, unknown> | undefined | null,
  sampleId?: string
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  if (!sample || typeof sample !== 'object') return entries

  const source = 'sample'
  const ctx = sampleId

  addEntry(entries, sample.first_initial_qc_start_date, 'First initial QC start', source, ctx)
  addEntry(entries, sample.first_prep_start_date, 'First prep start', source, ctx)

  const initialQc = sample.initial_qc as Record<string, unknown> | undefined
  if (initialQc) {
    addEntry(entries, initialQc.start_date, 'Initial QC start', source, ctx)
    addEntry(entries, initialQc.finish_date, 'Initial QC finish', source, ctx)
    addEntry(entries, initialQc.first_initial_qc_start_date, 'First initial QC start date', source, ctx)
  }

  const libraryPrep = sample.library_prep as Record<string, Record<string, unknown>> | undefined
  if (libraryPrep && typeof libraryPrep === 'object') {
    for (const [prepKey, prep] of Object.entries(libraryPrep)) {
      if (!prep || typeof prep !== 'object') continue
      addEntry(entries, prep.prep_start_date, `Prep start (${prepKey})`, source, ctx)
      addEntry(entries, prep.prep_finished_date, `Prep finished (${prepKey})`, source, ctx)
      addEntry(entries, prep.pre_prep_start_date, `Pre-prep start (${prepKey})`, source, ctx)
      const libVal = prep.library_validation as Record<string, Record<string, unknown>> | undefined
      if (libVal) {
        for (const lv of Object.values(libVal)) {
          if (lv && typeof lv === 'object') {
            addEntry(entries, lv.start_date, 'Library validation start', source, ctx)
            addEntry(entries, lv.finish_date, 'Library validation finish', source, ctx)
          }
        }
      }
      const runMetrics = prep.sample_run_metrics as Record<string, Record<string, unknown>> | undefined
      if (runMetrics) {
        for (const rm of Object.values(runMetrics)) {
          if (rm && typeof rm === 'object') {
            addEntry(entries, rm.sequencing_start_date, 'Sequencing start', source, ctx)
            addEntry(entries, rm.sequencing_finish_date, 'Sequencing finish', source, ctx)
            addEntry(entries, rm.dillution_and_pooling_start_date, 'Dilution and pooling start', source, ctx)
            addEntry(entries, rm.sequencing_run_QC_finished, 'Sequencing run QC finished', source, ctx)
          }
        }
      }
    }
  }

  entries.sort((a, b) => a.date.toMillis() - b.date.toMillis())
  return entries
}
