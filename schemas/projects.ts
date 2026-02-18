import { z } from 'zod'
import { StringOrUndefined, NumberOrUndefined, DateStringOrUndefined } from './basic'

// =============================================================================
// Search / listing (summary view row value)
// =============================================================================

export const projectSummaryListItemSchema = z.object({
  project_id: z.string(),
  project_name: z.string().optional(),
  application: z.string().nullable().optional(),
  open_date: z.string().optional(),
  close_date: z.string().optional(),
  status: z.string().optional(),
  no_samples: z.number().optional(),
  affiliation: z.string().optional(),
  contact: z.string().optional(),
  priority: z.string().nullable().optional(),
  modification_time: z.string().optional()
}).strict()

export type ProjectSummaryListItemSchema = z.infer<typeof projectSummaryListItemSchema>

// =============================================================================
// Summary row with full view value (details, project_summary, order_details, etc.)
// =============================================================================

export const projectSummaryWithDetailsItemSchema = projectSummaryListItemSchema.merge(
  z.object({
    details: z.record(z.string(), z.unknown()).optional(),
    project_summary: z.record(z.string(), z.unknown()).optional(),
    project_summary_links: z.array(z.tuple([z.string(), z.string()])).optional(),
    order_details: z.record(z.string(), z.unknown()).optional()
  })
).passthrough()

export type ProjectSummaryWithDetailsItemSchema = z.infer<typeof projectSummaryWithDetailsItemSchema>

// =============================================================================
// details.links (JSON string in DB) – parsed for UI
// =============================================================================

export const projectDetailsLinkEntrySchema = z.object({
  user: StringOrUndefined,
  email: StringOrUndefined,
  type: StringOrUndefined,
  title: StringOrUndefined,
  url: StringOrUndefined,
  desc: StringOrUndefined
}).loose()

export type ProjectDetailsLinkEntrySchema = z.infer<typeof projectDetailsLinkEntrySchema>

export const projectDetailsLinkRecordSchema = z.record(z.string(), projectDetailsLinkEntrySchema)

export type ProjectDetailsLinkRecordSchema = z.infer<typeof projectDetailsLinkRecordSchema>

/**
 * Safely parse details.links JSON string. Returns parsed record or null on invalid/missing input.
 */
export function parseDetailsLinks(links: string | undefined | null): ProjectDetailsLinkRecordSchema | null {
  if (links == null || typeof links !== 'string' || links.trim() === '')
    return null
  try {
    const parsed = JSON.parse(links) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result = projectDetailsLinkRecordSchema.safeParse(parsed)
      return result.success ? result.data : null
    }
    return null
  }
  catch {
    return null
  }
}

// ======================================================================================
// Full project document (permissive, for validating/cleaning API responses from CouchDB)
// ======================================================================================

export const projectDocumentSchema = z.object({
  _id: z.string(),
  _rev: z.string(),
  entity_type: StringOrUndefined,
  source: StringOrUndefined,
  project_name: z.string(),
  project_id: z.string(),
  application: StringOrUndefined.nullable().optional(),
  contact: StringOrUndefined.nullable().optional(),
  open_date: DateStringOrUndefined,
  close_date: DateStringOrUndefined,
  delivery_type: StringOrUndefined,
  reference_genome: StringOrUndefined,
  modification_time: StringOrUndefined,
  creation_time: StringOrUndefined,
  no_of_samples: NumberOrUndefined,
  details: z.record(z.string(), z.unknown()).optional(),
  order_details: z.record(z.string(), z.unknown()).optional(),
  affiliation: StringOrUndefined,
  priority: z.enum(['Low', 'Standard', 'High']).nullable().optional(),
  project_summary: z.record(z.string(), z.unknown()).optional(),
  project_summary_links: z.array(z.tuple([z.string(), z.string()])).optional(),
  samples: z.record(z.string(), z.unknown()).optional(),
  status_fields: z.record(z.string(), z.unknown()).optional(),
  staged_files: z.record(z.string(), z.unknown()).optional(),
  delivery_projects: z.array(z.string()).optional(),
  agreement_doc_id: StringOrUndefined,
  invoice_spec_generated: NumberOrUndefined,
  invoice_spec_downloaded: NumberOrUndefined,
  customer_reference: StringOrUndefined,
  uppnex_id: StringOrUndefined
}).loose()

export type ProjectDocumentSchema = z.infer<typeof projectDocumentSchema>

/**
 * Parse and optionally clean a raw project document for UI display.
 * Returns the parsed result or null if validation fails.
 */
export function parseProjectDocument(doc: unknown): ProjectDocumentSchema | null {
  const result = projectDocumentSchema.safeParse(doc)
  return result.success ? result.data : null
}

// =============================================================================
// tRPC input schemas
// =============================================================================

/** Input for getProject: the project_id field (used in URLs and as the public project identifier). */
export const getProjectInputSchema = z.object({
  projectId: z.string()
})

export type GetProjectInputSchema = z.infer<typeof getProjectInputSchema>

/** Input for listSummaries: filter and paginate project summaries. Supports search by project_id prefix and by project_name (substring, case-insensitive). */
export const listProjectsSummaryInputSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  project_id_prefix: z.string().optional(),
  /** Filter by project_name: case-insensitive substring match (e.g. "Svensson" matches "MA.Svensson_24_02"). */
  project_name_filter: z.string().optional(),
  application_filter: z.string().optional(),
  limit: z.number().optional(),
  skip: z.number().optional()
}).strict()

export type ListProjectsSummaryInputSchema = z.infer<typeof listProjectsSummaryInputSchema>

// =============================================================================
// NA result schemas (projects DB may be unavailable – no errors, wrapped result)
// =============================================================================

export const projectsAvailableResultSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true) }),
  z.object({ available: z.literal(false) })
])

export type ProjectsAvailableResultSchema = z.infer<typeof projectsAvailableResultSchema>

export const projectSingleResultSchema = z.discriminatedUnion('available', [
  z.object({
    available: z.literal(true),
    data: projectDocumentSchema.nullable()
  }),
  z.object({ available: z.literal(false) })
])

export type ProjectSingleResultSchema = z.infer<typeof projectSingleResultSchema>

export const projectListResultSchema = z.discriminatedUnion('available', [
  z.object({
    available: z.literal(true),
    items: z.array(projectSummaryListItemSchema),
    total_rows: z.number().optional(),
    offset: z.number().optional()
  }),
  z.object({ available: z.literal(false) })
])

export type ProjectListResultSchema = z.infer<typeof projectListResultSchema>

export const projectListWithDetailsResultSchema = z.discriminatedUnion('available', [
  z.object({
    available: z.literal(true),
    items: z.array(projectSummaryWithDetailsItemSchema),
    total_rows: z.number().optional(),
    offset: z.number().optional()
  }),
  z.object({ available: z.literal(false) })
])

export type ProjectListWithDetailsResultSchema = z.infer<typeof projectListWithDetailsResultSchema>
