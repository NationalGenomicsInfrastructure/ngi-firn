// =============================================================================================
// Types for projects that are stored in the Firn database (read-write, managed by Firn)
// =============================================================================================

import type { ProjectsDbDocument, ProjectPriority, ProjectStatusString } from './projects'
import type { TypedDocumentReference } from './references'

// Lightweight, embedded bookmark for a project document from the read-only projects database
export interface FirnProjectBookmark {
  // CouchDB `_id` of the project document in the `projects` database.
  projectDocId: TypedDocumentReference<ProjectsDbDocument>
  // LIMS / StatusDB project identifier (`project_id` in ProjectsDbDocument).
  projectId: string
  // Human-readable project name (`project_name`).
  projectName: string
  // Key characteristics
  status?: ProjectStatusString
  // Priority
  priority?: ProjectPriority
  application?: string | null
  affiliation?: string
  // Number of samples
  noOfSamples?: number
  // Note from user
  note?: string
}
