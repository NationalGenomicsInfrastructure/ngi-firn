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
}).loose()

export type ProjectSummaryListItemSchema = z.infer<typeof projectSummaryListItemSchema>

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
