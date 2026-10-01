import { z } from 'zod'

// Entity kinds that can carry project references.
export const projectLinkEntityKindSchema = z.enum(['item', 'container'])
export type ProjectLinkEntityKind = z.infer<typeof projectLinkEntityKindSchema>

export const projectLinkEntitySchema = z.object({
  entityKind: projectLinkEntityKindSchema,
  slug: z.string().min(1)
})
export type ProjectLinkEntity = z.infer<typeof projectLinkEntitySchema>

export const projectLinkBatchSchema = z.object({
  projectId: z.string().min(1, { message: 'LIMS project identifier is required' }),
  entities: z.array(projectLinkEntitySchema).min(1, { message: 'Select at least one entity' }).max(500)
})
export type ProjectLinkBatchInput = z.infer<typeof projectLinkBatchSchema>

export const projectLinkResultSchema = z.object({
  changed: z.array(z.string()),
  unchanged: z.array(z.string()),
  failed: z.array(z.object({ slug: z.string(), reason: z.string() }))
})
export type ProjectLinkResult = z.infer<typeof projectLinkResultSchema>
