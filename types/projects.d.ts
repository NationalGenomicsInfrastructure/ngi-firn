import type { BaseDocument } from '../server/database/couchdb'

// =============================================================================
// Project details (normalized UDFs: lowercase, spaces → underscores)
// =============================================================================

export interface ProjectDetails extends Record<string, unknown> {
  'portal_id'?: string
  'customer_project_reference'?: string
  'order_received'?: string
  'contract_received'?: string
  'contract_sent'?: string
  'project_coordinator'?: string
  'plates_sent'?: string
  'sample_information_received'?: string
  'samples_received'?: string
  'type'?: string
  'project_comment'?: string
  'queued'?: string
  'disposal_of_any_remaining_samples'?: string
  'custom_capture_design_id'?: string
  'all_samples_sequenced'?: string
  'links'?: string
  'delivery_type'?: string
  'best_practice_bioinformatics'?: string
  'all_raw_data_delivered'?: string
  'library_construction_method'?: string
  'sequencing_setup'?: string
  'sequencing_platform'?: string
  'sequence_units_ordered_(lanes)'?: number
  'custom_primer'?: boolean
  'low_diversity'?: boolean
  'flowcell'?: string
  'sample_type'?: string
  'application'?: string
  'signature_queued'?: string
  'signature_all_samples_sequenced'?: string
  'signature_all_raw_data_delivered'?: string
  'signature_aborted'?: string
  'shared'?: string
  'sensitive_data'?: string
  'reference_genome'?: string
  'organism'?: string
  'funding_agency'?: string
  'project_category'?: string
  'sample_units_ordered'?: number
  'aborted'?: string
  'library_prep_option_single_cell_(hashing)'?: string
  'library_prep_option_single_cell_(cite)'?: string
  'library_prep_option_single_cell_(vdj)'?: string
  'library_prep_option_single_cell_(feature)'?: string
  'customer_project_description'?: string
  'library_type_(ready-made_libraries)'?: string
  'running_notes'?: unknown
  'snic_checked'?: unknown
  'latest_sticky_note'?: unknown
}

// =============================================================================
// Parsed details.links (for UI; JSON string in DB)
// =============================================================================

export interface ProjectDetailsLinkEntry {
  user?: string
  email?: string
  type?: string
  title?: string
  url?: string
  desc?: string
}

export type ProjectDetailsLinkRecord = Record<string, ProjectDetailsLinkEntry>

// =============================================================================
// Order details (from Order Portal API)
// =============================================================================

export interface OrderDetailsOwner {
  name?: string
  email?: string
  affiliation?: string
}

export interface OrderDetailsFields {
  seq_readlength_hiseqx?: string | null
  library_readymade?: string | null
  bx_exp?: string | null
  seq_instrument?: string | null
  project_lab_email?: string | null
  project_bx_email?: string | null
  project_lab_name?: string | null
  bx_data_delivery?: string | null
  sample_no?: number | string | null
  bioinformatics?: string | null
  sequencing?: string | null
  project_pi_name?: string | null
  bx_bp?: string | null
  project_desc?: string | null
  project_pi_email?: string | null
}

export interface OrderDetails {
  created?: string
  modified?: string
  site?: string
  title?: string
  identifier?: string
  owner?: OrderDetailsOwner
  fields?: OrderDetailsFields
}

// =============================================================================
// Status fields (computed in Python set_status)
// =============================================================================

export type ProjectStatusString
  = | 'Aborted'
    | 'Closed'
    | 'Ongoing'
    | 'Reception Control'
    | 'Pending'
    | null

export interface ProjectStatusFields {
  status: ProjectStatusString
  aborted: boolean
  closed: boolean
  ongoing: boolean
  open: boolean
  pending: boolean
  reception_control: boolean
  need_review: boolean
}

// =============================================================================
// Staged files (sampleId -> path -> entry)
// =============================================================================

export interface StagedFileEntry {
  md5_sum: string
  size_in_bytes: number
  last_modified: string
}

export type StagedFiles = Record<string, Record<string, StagedFileEntry>>

// =============================================================================
// Project summary (project_summary field)
// =============================================================================

export interface ProjectSummary extends Record<string, unknown> {
  document_version?: string
  bioinfo_responsible?: string
  lab_responsible?: string
  queued?: string
  signature_queued?: string
  signature_all_samples_sequenced?: string
  signature_all_raw_data_delivered?: string
  instructions?: string
  method_document?: string
  comments?: string
  all_samples_sequenced?: string
  all_raw_data_delivered?: string
}

// =============================================================================
// Sample details (ProjectSample.details)
// =============================================================================

export interface SampleDetails extends Record<string, unknown> {
  'progress'?: string
  'sample_type'?: string
  'total_reads_(m)'?: number
  'reads_min'?: number
  'customer_name'?: string
  'passed_initial_qc'?: string
  'passed_library_qc'?: string
  'status_(auto)'?: string
  'status_(manual)'?: string
  'app_qc'?: string
  'passed_sequencing_qc'?: string
  'storage_type'?: string
  'tissue_type'?: string
  'species_name'?: string
  'genome_size'?: number | string
  'sample_weight'?: number
  'number_of_cells'?: number
  'pooling'?: string
  'sample_buffer'?: string
  'index_category'?: string
  'conc_method'?: string | number
  'customer_average_fragment_length'?: number
  'lanes_requested'?: number
  'customer_volume'?: number
}

// =============================================================================
// Sample-level types
// =============================================================================

export interface InitialQcEntry {
  'initial_qc_status'?: string
  'start_date'?: string
  'finish_date'?: string
  'first_initial_qc_start_date'?: string
  'initials'?: string
  'frag_an_image'?: string
  'caliper_image'?: string
  'concentration'?: number | string
  'volume_(ul)'?: number
  'size_(bp)'?: number
  'conc_units'?: string
  'failure_reason'?: string
  'ratio_(%)'?: number
  'amount_(ng)'?: number
  [key: string]: unknown
}

export interface CurrentStepEntry {
  step_name: string
  protocol_name: string
  is_qc_protocol: boolean
  status: string
}

export interface LibraryValidationEntry {
  'finish_date'?: string
  'initials'?: string
  'prep_status'?: string
  'well_location'?: string
  'frag_an_image'?: string
  'caliper_image'?: string
  'frag_an_ratio'?: number | string
  'concentration'?: number | string
  'conc_units'?: string
  'start_date'?: string
  'average_size_bp'?: number | string
  'amount_(ng)'?: number
  'volume_(ul)'?: number
  'size_(bp)'?: number
  'amount_(fmol)'?: number
  'failure_reason'?: string
  [key: string]: unknown
}

export interface SampleRunMetricsEntry {
  sequencing_finish_date?: string | null
  sequencing_start_date?: string
  seq_qc_flag?: string
  dem_qc_flag?: string
  sequencing_run_QC_finished?: string
  dillution_and_pooling_start_date?: string
  sample_run_metrics_id?: string | null
  [key: string]: unknown
}

export interface LibraryPrepEntry {
  'workset_setup'?: string
  'prep_start_date'?: string
  'prep_finished_date'?: string
  'prep_id'?: string
  'workset_name'?: string
  'prep_status'?: string
  'reagent_label'?: string
  'barcode'?: string
  'library_validation': Record<string, LibraryValidationEntry>
  'sequenced_fc': string[]
  'sample_run_metrics'?: Record<string, SampleRunMetricsEntry>
  'pre_prep_start_date'?: string
  'amount_taken_ng'?: number
  'amount_for_prep_ng'?: number
  'amount_for_prep_fmol'?: number
  'amount_taken_from_plate_ng'?: number
  'volume_ul'?: number
  'amount_taken_(ng)'?: number | null
  'amount_for_prep_(ng)'?: number | null
  'amount_for_prep_(fmol)'?: number | null
  'amount_taken_from_plate_(ng)'?: number | null
  'volume_(ul)'?: number | null
  [key: string]: unknown
}

export interface ProjectSample {
  scilife_name: string
  customer_name?: string
  details: SampleDetails
  initial_plate_id?: string
  well_location?: string
  initial_qc?: InitialQcEntry
  first_initial_qc_start_date?: string
  current_steps?: Record<string, CurrentStepEntry>
  library_prep?: Record<string, LibraryPrepEntry>
  first_prep_start_date?: string
  isFinishedLib?: boolean
}

// =============================================================================
// Main project document (projects DB)
// =============================================================================

export type ProjectPriority = 'Low' | 'Standard' | 'High' | null | undefined

export interface ProjectsDbDocument extends BaseDocument {
  type?: 'project'
  schema?: 1
  modification_time?: string
  creation_time?: string
  entity_type?: 'project_summary'
  source: 'lims'
  project_name: string
  project_id: string
  application?: string | null
  contact?: string | null
  open_date?: string
  close_date?: string
  delivery_type?: string
  reference_genome?: string
  details: ProjectDetails
  order_details?: OrderDetails
  affiliation?: string
  priority?: ProjectPriority
  project_summary?: ProjectSummary
  project_summary_links?: [string, string][]
  escalations?: [string, string, string][]
  no_of_samples: number
  samples: Record<string, ProjectSample>
  status_fields: ProjectStatusFields

  /** Not in LIMS, StatusDB only, preserved on update */
  staged_files?: StagedFiles
  agreement_doc_id?: string
  invoice_spec_generated?: number
  invoice_spec_downloaded?: number
  delivery_projects?: string[]

  /** Optional doc-level fields referenced in summary view */
  min_m_reads_per_sample_ordered?: unknown
  customer_reference?: string
  uppnex_id?: string
}

/** Alias for use in server/API (projects.server.ts imports Project). */
export type Project = ProjectsDbDocument

// =============================================================================
// View: project / project_id
// Emits: (doc.project_id, doc._id)  =>  key: string, value: string
// =============================================================================

export type ProjectIdViewKey = string
export type ProjectIdViewValue = string

export interface ProjectIdViewRow<TDoc = ProjectsDbDocument> {
  id?: string
  key: ProjectIdViewKey
  value: ProjectIdViewValue
  doc?: TDoc
}

// =============================================================================
// View: project / summary
// Emits: (["open" | "closed", doc.project_id], summary)  =>  key: [string, string], value: SummaryViewValue
// =============================================================================

export type SummaryViewKey = [string, string]

export interface SummaryViewValue {
  'details'?: ProjectDetails
  'project_summary'?: ProjectSummary
  'project_summary_links'?: [string, string][]
  'application'?: string | null
  'no_samples'?: number
  'ordered_reads'?: unknown
  'open_date'?: string
  'project_name'?: string
  'project_id'?: string
  'affiliation'?: string
  'order_details'?: OrderDetails
  'delivery_projects'?: string[]
  'modification_time'?: string
  'priority'?: ProjectPriority
  'contact'?: string
  'source'?: string
  'final_number_of_samples'?: number
  'reference_genome'?: string
  'customer_reference'?: string
  'delivery_type'?: string
  'uppnex_id'?: string
  'close_date'?: string
  'pending_reviews'?: [string, string, string][]
  'invoice_spec_downloaded'?: unknown
  'invoice_spec_generated'?: unknown
  'passed_samples'?: number
  'passed_library_qc'?: string
  'passed_initial_qc'?: string
  'passed_seq_qc'?: string
  'library_repreps'?: number
  'number_of_pools'?: number
  'lanes_sequenced'?: number
  'Aborted'?: number
  'In Progress'?: number
  'Finished'?: number
  [key: string]: unknown
}

export interface SummaryViewRow<TDoc = ProjectsDbDocument> {
  id?: string
  key: SummaryViewKey
  value: SummaryViewValue
  doc?: TDoc
}

// =============================================================================
// View: projects / lims_followed
// Emits: (doc.project_id, doc._id) for docs with open_date > 2013-08-01  =>  key: string, value: string
// =============================================================================

export type LimsFollowedViewKey = string
export type LimsFollowedViewValue = string

export interface LimsFollowedViewRow<TDoc = ProjectsDbDocument> {
  id?: string
  key: LimsFollowedViewKey
  value: LimsFollowedViewValue
  doc?: TDoc
}

// =============================================================================
// Generic CouchDB view response
// =============================================================================

export interface CouchViewResponse<TRow> {
  total_rows?: number
  offset?: number
  rows: TRow[]
}

// =============================================================================
// Typed query helper signatures (implement against your Couch/Cloudant client)
// =============================================================================

/**
 * Query design doc "project", view "project_id" by key.
 * Use include_docs: true to get the full document in each row.
 */
export type QueryProjectById = (
  projectId: string,
  options?: { include_docs?: boolean }
) => Promise<CouchViewResponse<ProjectIdViewRow>>

/**
 * Get a single project document by project_id (convenience).
 * Implement by querying project_id view with key=projectId and include_docs=true,
 * then return rows[0]?.doc ?? null.
 */
export type GetProjectByProjectId = (
  projectId: string
) => Promise<ProjectsDbDocument | null>

/**
 * Query design doc "project", view "summary" by key range.
 * Key is [status, project_id] e.g. ["closed", ""] to ["closed", "ZZZZZZZZ"] or ["open", ...].
 */
export type QueryProjectSummary = (options: {
  startkey?: SummaryViewKey
  endkey?: SummaryViewKey
  key?: SummaryViewKey
  include_docs?: boolean
  limit?: number
  skip?: number
}) => Promise<CouchViewResponse<SummaryViewRow>>

/**
 * Query design doc "projects", view "lims_followed" by key.
 * Returns project_ids with open_date > 2013-08-01. Use include_docs: true for full docs.
 */
export type QueryLimsFollowed = (
  projectId: string,
  options?: { include_docs?: boolean }
) => Promise<CouchViewResponse<LimsFollowedViewRow>>

/**
 * Get a single project document via lims_followed view (convenience).
 */
export type GetProjectByLimsFollowed = (
  projectId: string
) => Promise<ProjectsDbDocument | null>
